import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentCycle } from "../src/agent/cycle";
import { extractionPromptHash } from "../src/agent/extract";
import type { Extraction } from "../src/agent/types";
import * as repo from "../src/db";
import { complianceReport } from "../src/reports/compliance";
import { createTestDb } from "./helpers/d1";
import { fakeModel, fakeTwitter, NOW, ruleset, RULESET_HASH } from "./helpers/agent";

let db: D1Database;
let dispose: () => Promise<void>;

beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
});
afterEach(() => dispose());

const extraction = (tweetId: string, author: string, isPromo: boolean, hasDisclosure: boolean): Extraction => ({
  tweetId,
  author,
  postedAt: NOW - 1_000,
  mentions: [],
  isPromo,
  hasDisclosure,
  rationale: "",
});

describe("complianceReport", () => {
  it("is empty before any ruleset is committed", async () => {
    expect(await complianceReport(db, NOW)).toMatchObject({
      activeRuleset: null,
      rulesets: 0,
      trades: { total: 0, submitted: 0, stamped: 0, failed: 0 },
      replay: { match: 0, mismatch: 0, pending: 0 },
      flagged: { "undisclosed-promo": 0, "coordinated-burst": 0, "paid-marker": 0 },
      promotion: [],
    });
  });

  it("summarises trades, their replay verdicts and undisclosed promotion per KOL", async () => {
    await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
    await runAgentCycle({
      db,
      now: NOW,
      fetch: fakeTwitter(),
      twitterApiKey: "k",
      model: fakeModel(),
      submitStamp: vi.fn().mockResolvedValue(undefined),
    });
    const tweets = ["901", "902", "903"].map((id) => ({
      id,
      author: "shillooor",
      text: "buy $X",
      createdAt: new Date(NOW - 1_000).toUTCString(),
    }));
    await repo.saveTweets(db, tweets, NOW);
    await repo.saveExtractions(db, extractionPromptHash(), [
      extraction("901", "shillooor", true, false),
      extraction("902", "shillooor", true, true),
      extraction("903", "shillooor", false, false),
    ]);

    const report = await complianceReport(db, NOW);

    expect(report).toMatchObject({
      activeRuleset: RULESET_HASH,
      rulesets: 1,
      trades: { total: 1, submitted: 1, stamped: 0, failed: 0 },
      replay: { match: 0, mismatch: 0, pending: 1 },
      flagged: { "undisclosed-promo": 0, "coordinated-burst": 0, "paid-marker": 0 },
    });
    expect(report.promotion[0]).toEqual({ author: "shillooor", posts: 3, promo: 2, promoWithoutDisclosure: 1 });
    expect(report.promotion.map((p) => p.author)).toContain("cobie");
  });
});
