import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runAgentCycle } from "../src/agent/cycle";
import { app } from "../src/app";
import * as repo from "../src/db";
import { createTestDb } from "./helpers/d1";
import { fakeModel, fakeTwitter, NOW, ruleset, RULESET_HASH } from "./helpers/agent";

let db: D1Database;
let dispose: () => Promise<void>;
let tradeId: number;

beforeAll(async () => {
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
afterAll(() => dispose());

const get = async (path: string) => {
  const response = await app.request(path, {}, { DB: db });
  return { status: response.status, body: (await response.json()) as { success: boolean; data?: any; error?: string } };
};

describe("API routes", () => {
  it("lists committed rulesets", async () => {
    const { status, body } = await get("/v1/rulesets");
    expect(status).toBe(200);
    expect(body.data).toEqual([
      { hash: RULESET_HASH, effectiveFrom: ruleset.effectiveFrom, model: "gpt-6-luna", sources: 3, committedAt: NOW - 4_000_000, status: "confirmed", commitTx: null },
    ]);
  });

  it("serves the exact committed ruleset and confirms it hashes to its ID", async () => {
    const { body } = await get(`/v1/rulesets/${RULESET_HASH}`);
    expect(body).toEqual({ success: true, data: { hash: RULESET_HASH, verified: true, ruleset } });
  });

  it("rejects malformed and unknown ruleset hashes", async () => {
    expect((await get("/v1/rulesets/0x123")).status).toBe(400);
    expect((await get(`/v1/rulesets/0x${"00".repeat(32)}`)).status).toBe(404);
  });

  it("lists trades with their signal explanation", async () => {
    const { body } = await get("/v1/trades");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: tradeId, token: "LINK", side: "long", status: "submitted" });
    expect(body.data[0].explanation).toContain("LINK long");
    expect(body.data[0].flags).toEqual([]);
  });

  it("returns a trade with the full text of every post it cites", async () => {
    const { body } = await get(`/v1/trades/${tradeId}`);
    expect(body.data.posts.map((p: { id: string }) => p.id)).toEqual(["201", "101"]);
    expect(body.data.posts[0]).toMatchObject({ id: "201", author: "CryptoHayes", text: "Loading $LINK" });
  });

  it("replays a trade", async () => {
    const { body } = await get(`/v1/trades/${tradeId}/replay`);
    expect(body.data.verdict).toBe("pending");
    expect(body.data.checks).toHaveLength(4);
  });

  it("returns 404 for unknown trades and 400 for bad IDs", async () => {
    expect((await get("/v1/trades/9999/replay")).status).toBe(404);
    expect((await get("/v1/trades/abc/replay")).status).toBe(400);
  });

  it("serves the compliance report", async () => {
    const { body } = await get("/v1/reports/compliance");
    expect(body.data).toMatchObject({ rulesets: 1, trades: { total: 1 }, replay: { pending: 1 } });
  });
});
