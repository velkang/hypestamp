import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentCycle } from "../src/agent/cycle";
import { extractionPromptHash } from "../src/agent/extract";
import * as repo from "../src/db";
import { replayTrade } from "../src/replay";
import { bundleHash, parseStampRequest } from "../src/stamp/bundle";
import { tweetHash } from "../src/stamp/encoding";
import { createTestDb } from "./helpers/d1";
import { fakeModel, fakeTwitter, NOW, ruleset, RULESET_HASH } from "./helpers/agent";

let db: D1Database;
let dispose: () => Promise<void>;
let tradeId: number;

beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
  await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
  await runAgentCycle({
    db,
    now: NOW,
    fetch: fakeTwitter(),
    twitterApiKey: "k",
    model: fakeModel(),
    submitStamp: vi.fn().mockResolvedValue(undefined),
  });
  [{ id: tradeId }] = await repo.submittedTrades(db);
});
afterEach(() => dispose());

const checks = async (id: number) =>
  Object.fromEntries((await replayTrade(db, id))!.checks.map((c) => [c.name, c.status]));

async function stampCorrectly() {
  const trade = (await repo.submittedTrades(db))[0];
  const request = parseStampRequest(JSON.parse(trade.requestJson));
  const tweets = await repo.tweetsByIds(db, request.tweetIds);
  const hashes = request.tweetIds.map((id) => ({ id, hash: tweetHash(tweets.find((t) => t.id === id)!) }));
  const price = 2_371_480_000n;
  await repo.markStamped(db, trade.id, {
    bundleHash: bundleHash(request, hashes, price),
    entryPriceE8: price.toString(),
    txHash: "0xt",
    stampedAt: NOW,
  });
}

describe("replayTrade", () => {
  it("returns null for an unknown trade", async () => {
    expect(await replayTrade(db, 9_999)).toBeNull();
  });

  it("reproduces a submitted trade from stored inputs, with the stamp still pending", async () => {
    const result = await replayTrade(db, tradeId);
    expect(await checks(tradeId)).toEqual({ ruleset: "pass", signal: "pass", request: "pass", bundle: "pending" });
    expect(result!.verdict).toBe("pending");
  });

  it("matches end to end once the stamp's bundleHash recomputes", async () => {
    await stampCorrectly();
    expect(await checks(tradeId)).toEqual({ ruleset: "pass", signal: "pass", request: "pass", bundle: "pass" });
    expect((await replayTrade(db, tradeId))!.verdict).toBe("match");
  });

  it("replays the saved positions even after those positions close", async () => {
    const original = (await repo.getTrade(db, tradeId))!;
    await db.prepare("DELETE FROM trades").run();
    const earlier = await repo.insertSubmittedTrade(db, {
      rulesetHash: RULESET_HASH, token: "BTC", side: "long", requestJson: original.requestJson,
      signalJson: original.signalJson, submittedAt: NOW - 1000,
    });
    await runAgentCycle({ db, now: NOW, fetch: fakeTwitter(), twitterApiKey: "k", model: fakeModel(), submitStamp: vi.fn().mockResolvedValue(undefined) });
    const current = (await repo.listTrades(db)).find((t) => t.token === "LINK")!;
    expect(current.openTokens).toEqual(["BTC"]);
    await repo.markStamped(db, earlier, { bundleHash: "0xearlier", entryPriceE8: "100", txHash: "0xt", stampedAt: NOW });
    await repo.closeTrade(db, earlier, { priceE8: "120", priceAt: NOW + 1000, closedAt: NOW + 1000, reason: "take-profit" });
    expect((await checks(current.id)).request).toBe("pass");
  });

  it("detects edits to risk inputs even when they would still allow the trade", async () => {
    await db.prepare("UPDATE trades SET open_tokens_json = '[\"BTC\"]' WHERE id = ?").bind(tradeId).run();
    expect((await checks(tradeId)).request).toBe("fail");
  });

  it("rejects a decision whose saved positions already exhaust the risk limit", async () => {
    await db.prepare("UPDATE trades SET open_tokens_json = ? WHERE id = ?").bind(JSON.stringify(Array(ruleset.risk.maxOpen).fill("BTC")), tradeId).run();
    const result = (await replayTrade(db, tradeId))!;
    expect(result.checks.find((c) => c.name === "request")).toMatchObject({ status: "fail", detail: expect.stringContaining("max open positions") });
  });

  it("does not silently assume no positions when the committed snapshot is missing", async () => {
    await db.prepare("UPDATE trades SET open_tokens_json = NULL WHERE id = ?").bind(tradeId).run();
    expect((await checks(tradeId)).request).toBe("fail");
  });

  it("marks older trades without committed risk inputs incomplete", async () => {
    await db.prepare("UPDATE trades SET open_tokens_json = NULL, request_json = json_remove(request_json, '$.riskContextHash') WHERE id = ?").bind(tradeId).run();
    expect((await checks(tradeId)).request).toBe("pending");
    expect((await replayTrade(db, tradeId))!.verdict).toBe("pending");
  });

  it("keeps the entry replay valid after its paper exit", async () => {
    await stampCorrectly();
    await repo.closeTrade(db, tradeId, { priceE8: "2845776000", priceAt: NOW + 300000, closedAt: NOW + 300000, reason: "take-profit" });
    expect((await replayTrade(db, tradeId))!.verdict).toBe("match");
  });

  it("fails the bundle check when the recorded bundleHash does not recompute", async () => {
    await repo.markStamped(db, tradeId, { bundleHash: "0xbad", entryPriceE8: "1", txHash: "0xt", stampedAt: NOW });
    expect((await checks(tradeId)).bundle).toBe("fail");
    expect((await replayTrade(db, tradeId))!.verdict).toBe("mismatch");
  });

  it("detects an edited extraction", async () => {
    await db
      .prepare("UPDATE extractions SET json = json_set(json, '$.mentions[0].conviction', 0.99) WHERE tweet_id = '101' AND prompt_hash = ?")
      .bind(extractionPromptHash())
      .run();
    expect((await checks(tradeId)).request).toBe("fail");
  });

  it("detects an edited ruleset", async () => {
    await db
      .prepare("UPDATE rulesets SET json = json_set(json, '$.risk.maxPositionPct', 50) WHERE hash = ?")
      .bind(RULESET_HASH)
      .run();
    expect((await checks(tradeId)).ruleset).toBe("fail");
  });
});
