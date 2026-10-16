import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentCycle } from "../src/agent/cycle";
import { bundleHash, parseStampRequest } from "../src/stamp/bundle";
import { tweetHash, rulesetHash } from "../src/stamp/encoding";
import { app } from "../src/app";
import * as repo from "../src/db";
import { generateReport, getSavedReport, listSavedReports, ensureDailyReport, reportPeriod } from "../src/reports/saved";
import { createTestDb } from "./helpers/d1";
import { fakeModel, fakeTwitter, NOW, ruleset, RULESET_HASH } from "./helpers/agent";

const range = { startDate: "2026-10-15", endDate: "2026-10-15" };
let db: D1Database;
let dispose: () => Promise<void>;
let tradeId: number;
beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
  await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
  await runAgentCycle({ db, now: NOW, fetch: fakeTwitter(), twitterApiKey: "k", model: fakeModel(), submitStamp: vi.fn().mockResolvedValue(undefined) });
  tradeId = (await repo.listTrades(db))[0].id;
});
afterEach(async () => { vi.useRealTimers(); await dispose(); });

describe("saved reports", () => {
  it("freezes a complete captured report and serves it without recomputing live evidence", async () => {
    const report = await generateReport(db, range, NOW + 1000);
    expect(report).toMatchObject({ schemaVersion: 1, source: "manual", coverage: { live: 1, demo: 0 },
      period: { ...range, timeZone: "UTC", partial: true }, summary: { total: 1, submitted: 1, replay: { pending: 1 } } });
    await repo.markStamped(db, tradeId, { bundleHash: "0xchanged", entryPriceE8: "100", txHash: "0xt", stampedAt: NOW + 2000 });
    await repo.closeTrade(db, tradeId, { priceE8: "120", priceAt: NOW + 3000, closedAt: NOW + 3000, reason: "take-profit" });
    await db.prepare("UPDATE extractions SET json = '{}' ").run();
    expect(await getSavedReport(db, report.id)).toEqual(report);
    const response = await app.request(`/v1/reports/${report.id}`, {}, { DB: db });
    expect((await response.json() as any).data).toEqual(report);
    expect((await listSavedReports(db))[0]).toMatchObject({ id: report.id, summary: report.summary });
    expect((await listSavedReports(db))[0]).not.toHaveProperty("trades");
  });

  it("uses inclusive UTC dates and excludes earlier trades that only closed in the period", async () => {
    const original = (await repo.getTrade(db, tradeId))!;
    const earlier = await repo.insertSubmittedTrade(db, { rulesetHash: RULESET_HASH, token: "ETH", side: "long", requestJson: original.requestJson, signalJson: original.signalJson, submittedAt: Date.parse("2026-10-14T23:59:59.999Z") });
    await repo.markStamped(db, earlier, { bundleHash: "0xearlier", entryPriceE8: "100", txHash: "0xt", stampedAt: NOW - 1000 });
    await repo.closeTrade(db, earlier, { priceE8: "120", priceAt: NOW, closedAt: NOW, reason: "take-profit" });
    const later = await repo.insertSubmittedTrade(db, { rulesetHash: RULESET_HASH, token: "BTC", side: "long", requestJson: original.requestJson, signalJson: original.signalJson, submittedAt: Date.parse("2026-10-16T00:00:00Z") });
    const report = await generateReport(db, range, Date.parse("2026-10-17T00:00:00Z"));
    expect(report.trades.map((t) => t.id)).toEqual([tradeId]);
    expect(report.trades.some((t) => t.id === earlier || t.id === later)).toBe(false);
    expect(report.period.partial).toBe(false);
  });

  it("captures matched and mismatched replay results with the shared engine", async () => {
    const trade = (await repo.getTrade(db, tradeId))!;
    const request = parseStampRequest(JSON.parse(trade.requestJson));
    const tweets = await repo.tweetsByIds(db, request.tweetIds);
    const hashes = request.tweetIds.map(id => ({ id, hash: tweetHash(tweets.find(t => t.id === id)!) }));
    const price = 237148000000n;
    await repo.markStamped(db, tradeId, { bundleHash: bundleHash(request, hashes, price), entryPriceE8: String(price), txHash: "0xt", stampedAt: NOW });
    const matched = await generateReport(db, range, NOW);
    expect(matched.summary.replay).toEqual({ match: 1, mismatch: 0, pending: 0 });
    await db.prepare("UPDATE trades SET open_tokens_json = '[\"BTC\"]' WHERE id = ?").bind(tradeId).run();
    const mismatch = await generateReport(db, range, NOW + 1);
    expect(mismatch.summary.replay).toEqual({ match: 0, mismatch: 1, pending: 0 });
    expect(await getSavedReport(db, matched.id)).toEqual(matched);
  });

  it("includes both exact UTC boundaries but not the next day", async () => {
    const trade = (await repo.getTrade(db, tradeId))!;
    const ids = [];
    for (const time of [Date.parse("2026-10-15T00:00:00.000Z"), Date.parse("2026-10-15T23:59:59.999Z")]) {
      ids.push(await repo.insertSubmittedTrade(db, { rulesetHash: RULESET_HASH, token: "BTC", side: "long", requestJson: trade.requestJson, signalJson: trade.signalJson, submittedAt: time }));
    }
    const report = await generateReport(db, range, NOW + 86400000);
    expect(report.trades.map(t => t.id)).toEqual([...ids.reverse(), tradeId]);
  });

  it("prevents duplicate daily snapshots when ticks overlap", async () => {
    const now = Date.parse("2026-10-16T00:10:00Z");
    const results = await Promise.all([ensureDailyReport(db, now), ensureDailyReport(db, now)]);
    expect(results.every(r => r.id === "daily-2026-10-15")).toBe(true);
    expect(await listSavedReports(db)).toHaveLength(1);
  });

  it("includes later exits known at capture and distinguishes demo records", async () => {
    await repo.markStamped(db, tradeId, { bundleHash: "0xtest", entryPriceE8: "10000000000", txHash: "0xt", stampedAt: NOW });
    await repo.closeTrade(db, tradeId, { priceE8: "12000000000", priceAt: NOW + 86400000, closedAt: NOW + 86400000, reason: "take-profit" });
    await db.prepare("UPDATE trades SET is_demo = 1 WHERE id = ?").bind(tradeId).run();
    const report = await generateReport(db, range, NOW + 86400001);
    expect(report.coverage).toEqual({ demo: 1, live: 0 });
    expect(report.trades[0]).toMatchObject({ closedAt: NOW + 86400000, pnl: { returnPct: 20, bookContributionPct: 0.8 } });
  });

  it("scopes source observations to the selected post dates", async () => {
    const report = await generateReport(db, { startDate: "2026-10-14", endDate: "2026-10-14" }, NOW);
    expect(report.promotion).toEqual([]);
    expect(report.summary.total).toBe(0);
  });

  it("pins source observations to the analysis prompt active at capture", async () => {
    const first = await generateReport(db, range, NOW);
    expect(first.methodology.promotionPromptHash).toBe(ruleset.extraction.promptHash);
    expect(first.promotion.length).toBeGreaterThan(0);
    const next = { ...ruleset, effectiveFrom: NOW / 1000 - 1, extraction: { ...ruleset.extraction, promptHash: `0x${"12".repeat(32)}` } };
    await repo.saveRuleset(db, next, rulesetHash(next), NOW - 120000);
    const changed = await generateReport(db, range, NOW + 1);
    expect(changed.methodology.promotionPromptHash).toBe(next.extraction.promptHash);
    expect(changed.promotion).toEqual([]);
    expect(changed.trades[0].replay).toEqual(first.trades[0].replay);
    expect((await getSavedReport(db, first.id))!.methodology).toEqual(first.methodology);
  });

  it("publishes no partial report if the capture cannot be verified", async () => {
    await db.prepare("UPDATE rulesets SET json = '{}' WHERE hash = ?").bind(RULESET_HASH).run();
    await expect(generateReport(db, range, NOW)).rejects.toThrow();
    expect(await listSavedReports(db)).toEqual([]);
  });

  it("protects custom generation, validates input, and keeps the live-summary API", async () => {
    const env = { DB: db, ADMIN_TOKEN: "owner" };
    const post = (body: string, token?: string) => app.request("/v1/admin/reports", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body }, env);
    expect((await post(JSON.stringify(range))).status).toBe(401);
    expect((await post("{", "owner")).status).toBe(400);
    expect((await post(JSON.stringify({ startDate: "2026-02-30", endDate: "2026-03-01" }), "owner")).status).toBe(400);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
    const response = await post(JSON.stringify(range), "owner");
    expect(response.status).toBe(201);
    expect((await app.request("/v1/reports", {}, env)).status).toBe(200);
    expect((await app.request("/v1/reports/compliance", {}, env)).status).toBe(200);
    expect((await app.request(`/v1/reports/${crypto.randomUUID()}`, {}, env)).status).toBe(404);
  });

  it("retains the initial day when a failed first capture crosses midnight", async () => {
    const firstTick = Date.parse("2026-10-16T00:10:00Z");
    await db.prepare("UPDATE rulesets SET json = '{}' WHERE hash = ?").bind(RULESET_HASH).run();
    await expect(ensureDailyReport(db, firstTick)).rejects.toThrow();
    await db.prepare("UPDATE rulesets SET json = ? WHERE hash = ?").bind(JSON.stringify(ruleset), RULESET_HASH).run();
    expect(await ensureDailyReport(db, firstTick + 86400000)).toEqual({ id: "daily-2026-10-15" });
    expect(await ensureDailyReport(db, firstTick + 86400000 + 300000)).toEqual({ id: "daily-2026-10-16" });
  });

  it("waits for 00:10 UTC, retries failures, is idempotent and catches up one day per tick", async () => {
    const midnight = Date.parse("2026-10-16T00:00:00Z");
    expect(await ensureDailyReport(db, midnight + 9 * 60000)).toEqual({ id: null });
    await db.prepare("UPDATE rulesets SET json = '{}' WHERE hash = ?").bind(RULESET_HASH).run();
    await expect(ensureDailyReport(db, midnight + 10 * 60000)).rejects.toThrow();
    expect(await listSavedReports(db)).toEqual([]);
    await db.prepare("UPDATE rulesets SET json = ? WHERE hash = ?").bind(JSON.stringify(ruleset), RULESET_HASH).run();
    expect(await ensureDailyReport(db, midnight + 15 * 60000)).toEqual({ id: "daily-2026-10-15" });
    expect(await ensureDailyReport(db, midnight + 20 * 60000)).toEqual({ id: null });
    const saved = await getSavedReport(db, "daily-2026-10-15");
    expect(await generateReport(db, range, midnight + 30 * 60000, "daily")).toEqual(saved);
    expect(await ensureDailyReport(db, midnight + 3 * 86400000 + 600000)).toEqual({ id: "daily-2026-10-16" });
    expect(await ensureDailyReport(db, midnight + 3 * 86400000 + 900000)).toEqual({ id: "daily-2026-10-17" });
    expect(await listSavedReports(db)).toHaveLength(3);
  });
});

describe("report date validation", () => {
  it.each([
    { startDate: "2026-10-16", endDate: "2026-10-15" },
    { startDate: "2026-10-15", endDate: "2027-01-01" },
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-10-15T00:00:00Z", endDate: "2026-10-15" },
    { ...range, secret: "unexpected" },
  ])("rejects invalid periods %j", (input) => expect(() => reportPeriod(input, NOW)).toThrow());
});
