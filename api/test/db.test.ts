import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as repo from "../src/db";
import { rulesetHash } from "../src/stamp/encoding";
import type { Extraction } from "../src/agent/types";
import { createTestDb } from "./helpers/d1";
import { demoRuleset } from "./fixtures/ruleset";

let db: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ db, dispose } = await createTestDb());
});
afterAll(() => dispose());

const tweet = (id: string, postedAt: number) => ({
  id,
  author: "cobie",
  text: `t${id}`,
  createdAt: new Date(postedAt).toUTCString(),
});

describe("rulesets", () => {
  it("returns the latest ruleset already in effect", async () => {
    const early = { ...demoRuleset, effectiveFrom: 1_000 };
    const later = { ...demoRuleset, effectiveFrom: 2_000 };
    await repo.saveRuleset(db, early, rulesetHash(early), 900);
    await repo.saveRuleset(db, later, rulesetHash(later), 1_900);

    expect((await repo.activeRuleset(db, 1_500_000))?.hash).toBe(rulesetHash(early));
    expect((await repo.activeRuleset(db, 2_000_000))?.ruleset).toEqual(later);
    expect(await repo.activeRuleset(db, 999_000)).toBeNull();
  });
});

describe("tweets and extractions", () => {
  it("stores tweets once and lists those still needing extraction for a prompt", async () => {
    await repo.saveTweets(db, [tweet("1", 10_000), tweet("2", 20_000)], 30_000);
    await repo.saveTweets(db, [tweet("1", 10_000)], 40_000);

    const extraction: Extraction = {
      tweetId: "1",
      author: "cobie",
      postedAt: 10_000,
      mentions: [],
      isPromo: false,
      hasDisclosure: false,
      rationale: "",
    };
    await repo.saveExtractions(db, "0xprompt", [extraction]);

    expect((await repo.tweetsNeedingExtraction(db, "0xprompt", 0)).map((t) => t.id)).toEqual(["2"]);
    expect((await repo.tweetsNeedingExtraction(db, "0xother", 15_000)).map((t) => t.id)).toEqual(["2"]);
    expect(await repo.extractionsSince(db, "0xprompt", 0)).toEqual([extraction]);
    expect(await repo.extractionsSince(db, "0xprompt", 11_000)).toEqual([]);
    expect(await repo.extractionsSince(db, "0xprompt", 0, 29_999)).toEqual([]); // fetched at 30_000
    expect(await repo.extractionsSince(db, "0xprompt", 0, 30_000)).toEqual([extraction]);
  });

  it("returns stored tweets by ID", async () => {
    expect((await repo.tweetsByIds(db, ["2", "1"])).map((t) => t.id).sort()).toEqual(["1", "2"]);
  });
});

describe("trades", () => {
  it("tracks a trade from submission to stamp and reports open tokens", async () => {
    const hash = rulesetHash({ ...demoRuleset, effectiveFrom: 1_000 });
    const id = await repo.insertSubmittedTrade(db, {
      rulesetHash: hash,
      token: "LINK",
      side: "long",
      requestJson: "{}",
      signalJson: "{}",
      submittedAt: 50_000,
    });

    expect(await repo.openTradeTokens(db)).toEqual(["LINK"]);
    expect((await repo.submittedTrades(db)).map((t) => t.id)).toEqual([id]);

    await repo.markStamped(db, id, { bundleHash: "0xb", entryPriceE8: "123", txHash: "0xt", stampedAt: 60_000 });
    expect(await repo.submittedTrades(db)).toEqual([]);
    expect(await repo.openTradeTokens(db)).toEqual(["LINK"]);

    await repo.markFailed(db, id);
    expect(await repo.openTradeTokens(db)).toEqual([]);
  });
});

describe("ledger sync cursor", () => {
  it("starts empty and remembers the last synced block", async () => {
    expect(await repo.lastSyncedBlock(db)).toBeNull();
    await repo.setLastSyncedBlock(db, 123n);
    await repo.setLastSyncedBlock(db, 456n);
    expect(await repo.lastSyncedBlock(db)).toBe(456n);
  });
});
