import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closePositions, realizedPnl } from "../src/agent/exits";
import * as repo from "../src/db";
import { app } from "../src/app";
import type { StampRequest } from "../src/stamp/bundle";
import { createTestDb } from "./helpers/d1";
import { NOW, ruleset, RULESET_HASH } from "./helpers/agent";

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
  await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
});
afterEach(() => dispose());

async function position(side: "long" | "short" = "long", token = "LINK", coingeckoId = "chainlink") {
  const request: StampRequest = {
    rulesetHash: RULESET_HASH, signal: { token, coingeckoId, side }, tweetIds: ["101"],
    extractionsHash: `0x${"ab".repeat(32)}`, trade: { sizePct: 4, stopLossPct: 8, takeProfitPct: 20 }, flags: 0, observedAt: NOW / 1000 - 600,
  };
  const id = await repo.insertSubmittedTrade(db, {
    rulesetHash: RULESET_HASH, token, side, requestJson: JSON.stringify(request),
    signalJson: JSON.stringify({ explanation: "test", kols: [] }), submittedAt: NOW - 600_000,
  });
  await repo.markStamped(db, id, { bundleHash: `0xb${id}`, entryPriceE8: "10000000000", txHash: "0xt", stampedAt: NOW - 300_000 });
  return id;
}
const prices = (body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)));
const quote = (usd: number, at = NOW) => ({ usd, last_updated_at: at / 1000 });

describe("paper exits", () => {
  it.each([
    ["long", 92, "stop-loss", -8, -0.32],
    ["long", 120, "take-profit", 20, 0.8],
    ["short", 108, "stop-loss", -8, -0.32],
    ["short", 80, "take-profit", 20, 0.8],
    ["long", 85, "stop-loss", -15, -0.6],
  ] as const)("closes %s at observed price %s (%s)", async (side, usd, reason, returnPct, bookContributionPct) => {
    const id = await position(side);
    const fetch = prices({ chainlink: quote(usd) });
    expect(await closePositions({ db, fetch, now: NOW })).toEqual({ closed: [id], errors: [] });
    const trade = (await repo.getTrade(db, id))!;
    expect(trade).toMatchObject({ status: "stamped", closedAt: NOW, exitPriceAt: NOW, exitReason: reason, exitPriceE8: BigInt(usd * 1e8).toString() });
    expect(realizedPnl(trade)).toEqual({ returnPct, bookContributionPct });
    expect(await repo.openTradeTokens(db)).toEqual([]);
    expect(await closePositions({ db, fetch, now: NOW + 300_000 })).toEqual({ closed: [], errors: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const response = await app.request(`/v1/trades/${id}`, {}, { DB: db });
    expect((await response.json() as any).data.pnl).toEqual({ returnPct, bookContributionPct });
  });

  it.each([["long", 100.07, "take-profit"], ["long", 99.93, "stop-loss"], ["short", 100.07, "stop-loss"], ["short", 99.93, "take-profit"]] as const)(
    "honours the exact fractional boundary for %s at %s", async (side, usd, reason) => {
      const id = await position(side);
      await db.prepare("UPDATE trades SET request_json = json_set(request_json, '$.trade.stopLossPct', 0.07, '$.trade.takeProfitPct', 0.07) WHERE id = ?").bind(id).run();
      expect((await closePositions({ db, fetch: prices({ chainlink: quote(usd) }), now: NOW })).closed).toEqual([id]);
      expect((await repo.getTrade(db, id))!.exitReason).toBe(reason);
    },
  );

  it("keeps positions open inside thresholds and batches different coins", async () => {
    await position();
    await position("short", "ETH", "ethereum");
    const fetch = prices({ chainlink: quote(100), ethereum: quote(100) });
    expect(await closePositions({ db, fetch, now: NOW })).toEqual({ closed: [], errors: [] });
    expect(await repo.openTradeTokens(db)).toEqual(["LINK", "ETH"]);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get("ids")).toBe("ethereum,chainlink");
    expect(url.searchParams.get("include_last_updated_at")).toBe("true");
  });

  it.each([
    {}, { usd: 0 }, { usd: -1 }, { usd: "120", last_updated_at: NOW / 1000 },
    quote(120, NOW - 601_000), quote(120, NOW + 1000), quote(120, NOW - 301_000),
    { usd: 120 }, { usd: 1e20, last_updated_at: NOW / 1000 },
  ])("does not close on an invalid or unsuitable quote %j", async (badQuote) => {
    await position();
    const result = await closePositions({ db, fetch: prices({ chainlink: badQuote }), now: NOW });
    expect(result.closed).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(await repo.openTradeTokens(db)).toEqual(["LINK"]);
  });

  it("continues checking another position when a coin's quote is missing", async () => {
    await position();
    const eth = await position("long", "ETH", "ethereum");
    const result = await closePositions({ db, fetch: prices({ ethereum: quote(120) }), now: NOW });
    expect(result.closed).toEqual([eth]);
    expect(result.errors).toHaveLength(1);
  });

  it("leaves trades intact when the price provider fails", async () => {
    await position();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("", { status: 429 }));
    await expect(closePositions({ db, fetch, now: NOW })).rejects.toThrow("429");
    expect(await repo.openTradeTokens(db)).toEqual(["LINK"]);
  });

  it("records only one exit when two checks race to close the same trade", async () => {
    const id = await position();
    const exit = { priceE8: "12000000000", priceAt: NOW, closedAt: NOW, reason: "take-profit" as const };
    const results = await Promise.all([repo.closeTrade(db, id, exit), repo.closeTrade(db, id, exit)]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("never exits illustrative or unconfirmed positions", async () => {
    const id = await position();
    await db.prepare("UPDATE trades SET is_demo = 1 WHERE id = ?").bind(id).run();
    await repo.insertSubmittedTrade(db, { rulesetHash: RULESET_HASH, token: "ETH", side: "long", requestJson: "{}", signalJson: "{}", submittedAt: NOW });
    const fetch = prices({ chainlink: quote(120) });
    expect(await closePositions({ db, fetch, now: NOW })).toEqual({ closed: [], errors: [] });
    expect(fetch).not.toHaveBeenCalled();
    expect(await repo.openTradeTokens(db)).toEqual(["ETH"]);
  });
});
