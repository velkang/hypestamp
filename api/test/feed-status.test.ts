import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentCycle } from "../src/agent/cycle";
import { app } from "../src/app";
import * as repo from "../src/db";
import { createTestDb } from "./helpers/d1";
import { fakeModel, fakeTwitter, NOW, ruleset, RULESET_HASH } from "./helpers/agent";

let db: D1Database;
let dispose: () => Promise<void>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  ({ db, dispose } = await createTestDb());
});
afterEach(async () => {
  vi.useRealTimers();
  await dispose();
});

const get = async (path: string) => {
  const response = await app.request(path, {}, { DB: db });
  return { status: response.status, body: (await response.json()) as { success: boolean; data?: any } };
};

async function seedCycle() {
  await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
  await runAgentCycle({
    db,
    now: NOW,
    fetch: fakeTwitter(),
    twitterApiKey: "k",
    model: fakeModel(),
    submitStamp: vi.fn().mockResolvedValue(undefined),
  });
}

describe("GET /v1/status", () => {
  it("reports no active ruleset and no demo data on an empty ledger", async () => {
    const { body } = await get("/v1/status");
    expect(body.data).toEqual({
      activeRuleset: null,
      demo: false,
      trades: { submitted: 0, stamped: 0, failed: 0 },
    });
  });

  it("summarises the active ruleset and trade counts", async () => {
    await seedCycle();
    const { body } = await get("/v1/status");
    expect(body.data).toMatchObject({
      activeRuleset: { hash: RULESET_HASH, effectiveFrom: ruleset.effectiveFrom, model: "gpt-6-luna", sources: 3, windowHours: 6 },
      demo: false,
      trades: { submitted: 1, stamped: 0, failed: 0 },
    });
  });

  it("flags demo data when any trade is marked illustrative", async () => {
    await seedCycle();
    await db.prepare("UPDATE trades SET is_demo = 1").run();
    expect((await get("/v1/status")).body.data.demo).toBe(true);
  });
});

describe("GET /v1/feed", () => {
  it("is empty without an active ruleset", async () => {
    expect((await get("/v1/feed")).body.data).toEqual({ window: null, posts: [] });
  });

  it("lists posts in the active window, newest first, with extractions and citing trades", async () => {
    await seedCycle();
    const { body } = await get("/v1/feed");
    const [tradeId] = (await repo.listTrades(db)).map((t) => t.id);

    expect(body.data.window).toEqual({ from: NOW - 6 * 3_600_000, to: NOW });
    expect(body.data.posts.map((p: { id: string }) => p.id)).toEqual(["301", "201", "101"]);
    expect(body.data.posts[1]).toMatchObject({
      id: "201",
      author: "CryptoHayes",
      text: "Loading $LINK",
      extraction: { mentions: [{ token: "LINK", sentiment: 0.7, conviction: 0.8 }], isPromo: false },
      citedBy: [tradeId],
    });
    expect(body.data.posts[0].citedBy).toEqual([]);
  });
});
