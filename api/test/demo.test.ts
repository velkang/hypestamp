import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { stringToHex } from "viem";
import { runAgentCycle } from "../src/agent/cycle";
import { extractionPromptHash, type ExtractionClient } from "../src/agent/extract";
import { closePositions, realizedPnl } from "../src/agent/exits";
import type { Extraction } from "../src/agent/types";
import * as repo from "../src/db";
import { reconcileStamps, type LedgerSource } from "../src/ledger/reconcile";
import { replayTrade } from "../src/replay";
import { generateReport, getSavedReport } from "../src/reports/saved";
import { bundleHash, parseStampRequest } from "../src/stamp/bundle";
import { rulesetHash, tweetHash } from "../src/stamp/encoding";
import { demoRuleset } from "./fixtures/ruleset";
import { createTestDb } from "./helpers/d1";

// Entirely synthetic rehearsal: these are invented accounts, posts, analyses,
// prices and ledger events. No model, provider, bridge or RPC is contacted.
const now = Date.parse("2026-10-26T12:00:00Z");
const posts = [
  { id: "90001", author: "demo_alice", text: "Demo: I am long $LINK today.", createdAt: "Mon Oct 26 11:00:00 +0000 2026" },
  { id: "90002", author: "demo_bob", text: "Demo: I hold $LINK and expect upside.", createdAt: "Mon Oct 26 11:30:00 +0000 2026" },
];
const analyses: Extraction[] = posts.map((post) => ({
  tweetId: post.id, author: post.author, postedAt: Date.parse(post.createdAt),
  mentions: [{ token: "LINK", sentiment: 0.7, conviction: 0.8, urgency: 0.4 }],
  isPromo: false, hasDisclosure: true, rationale: "Hand-authored demo analysis of an explicit long position.",
}));

it("rehearses agreement, risk, reconciliation, replay, exit and immutable reports in isolated D1", async () => {
  const { db, dispose } = await createTestDb();
  try {
    const rules = { ...demoRuleset, effectiveFrom: now / 1000 - 2 * 3600,
      sources: [{ handle: "demo_alice", trustWeight: 0.9 }, { handle: "demo_bob", trustWeight: 0.8 }],
      extraction: { ...demoRuleset.extraction, promptHash: extractionPromptHash() } };
    const hash = rulesetHash(rules);
    // A confirmed fixture is needed to exercise the production decision path.
    // This database is ephemeral and never exported or used by the application.
    await repo.saveRuleset(db, rules, hash, now - 600_000);
    await repo.saveTweets(db, posts.slice(0, 1), now - 60_000);
    await repo.saveExtractions(db, rules.extraction.promptHash, analyses.slice(0, 1));
    const submissions: unknown[] = [];
    let visiblePosts = posts.slice(0, 1);
    const fixtureFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin !== "https://api.twitterapi.io") throw new Error(`Unexpected demo URL: ${url.origin}`);
      return new Response(JSON.stringify({ data: { tweets: visiblePosts
        .filter((post) => post.author === url.searchParams.get("userName"))
        .map((post) => ({ ...post, author: { userName: post.author }, retweeted_tweet: null })) } }));
    };
    const model = { responses: { parse: async () => { throw new Error("Demo must use saved hand-authored analyses"); } } } as unknown as ExtractionClient;
    const deps = { db, now, fetch: fixtureFetch, twitterApiKey: "fixture", model,
      submitStamp: async (request: unknown) => { submissions.push(request); } };
    const noAgreement = await runAgentCycle({ ...deps, now: now - 60_000 });
    expect(noAgreement).toMatchObject({ submitted: [], errors: [] });

    visiblePosts = posts;
    await repo.saveTweets(db, posts.slice(1), now);
    await repo.saveExtractions(db, rules.extraction.promptHash, analyses.slice(1));
    const agreement = await runAgentCycle(deps);
    expect(agreement).toMatchObject({ submitted: ["LINK"], errors: [] });
    expect(submissions).toHaveLength(1);
    const request = parseStampRequest(submissions[0]);
    expect(request.trade).toEqual({ sizePct: 4, stopLossPct: 8, takeProfitPct: 20 });
    expect(await runAgentCycle(deps)).toMatchObject({ submitted: [] });
    const [trade] = await repo.submittedTrades(db);
    const pending = await replayTrade(db, trade.id);
    expect(pending?.verdict).toBe("pending");

    const price = 1_000_000_000n; // synthetic $10 entry
    const digest = bundleHash(request, request.tweetIds.map((id) => ({ id, hash: tweetHash(posts.find((post) => post.id === id)!) })), price);
    const ledger: LedgerSource = {
      headBlock: async () => 1n,
      committedRulesets: async () => [],
      stampedEvents: async () => [{ bundleHash: digest, rulesetHash: hash, token: stringToHex("LINK", { size: 32 }),
        entryPriceE8: price, txHash: `0x${"00".repeat(32)}`, blockNumber: 1n }],
    };
    expect(await reconcileStamps({ db, ledger, now, startBlock: 1n })).toMatchObject({ stamped: [trade.id] });
    const matched = await replayTrade(db, trade.id);
    expect(matched?.verdict).toBe("match");
    expect(realizedPnl((await repo.getTrade(db, trade.id))!)).toBeNull();

    const exitAt = now + 300_000;
    const exits = await closePositions({ db, now: exitAt, fetch: async () => new Response(JSON.stringify({
      chainlink: { usd: 12, last_updated_at: exitAt / 1000 },
    })) });
    expect(exits).toEqual({ closed: [trade.id], errors: [] });
    expect(realizedPnl((await repo.getTrade(db, trade.id))!)).toEqual({ returnPct: 20, bookContributionPct: 0.8 });
    expect(await repo.openTradeTokens(db)).toEqual([]);
    expect(await runAgentCycle({ ...deps, now: exitAt })).toMatchObject({ submitted: [] });

    // Exit logic excludes demo rows in the app. Exercise it above only in this
    // isolated database, then label every exported report record as demo.
    await db.prepare("UPDATE trades SET is_demo = 1 WHERE id = ?").bind(trade.id).run();
    const range = { startDate: "2026-10-26", endDate: "2026-10-26" };
    const report = await generateReport(db, range, exitAt);
    expect(report.coverage).toEqual({ demo: 1, live: 0 });
    expect(report.trades[0]).toMatchObject({ exitReason: "take-profit", pnl: { returnPct: 20, bookContributionPct: 0.8 } });
    expect(report.summary.replay).toEqual({ match: 1, mismatch: 0, pending: 0 });

    await db.prepare("UPDATE trades SET open_tokens_json = '[\"BTC\"]' WHERE id = ?").bind(trade.id).run();
    const mismatch = await replayTrade(db, trade.id);
    expect(mismatch?.verdict).toBe("mismatch");
    expect(await getSavedReport(db, report.id)).toEqual(report);

    if (process.env.HYPESTAMP_DEMO === "1") {
      const output = resolve("../demo-output");
      mkdirSync(output, { recursive: true });
      writeFileSync(resolve(output, "rehearsal.json"), JSON.stringify({
        warning: "SYNTHETIC REHEARSAL ONLY. Posts and analyses are hand-authored; prices and ledger events are simulated. No live LLM, CRE execution, Sepolia transaction or real funds. This is not proof of the live integration.",
        rules, posts, analyses, noAgreement, agreement, request, pending, matched, exits, mismatch, report,
      }, null, 2) + "\n");
      console.info(`Synthetic rehearsal passed. Artifact: ${output}/rehearsal.json`);
    }
  } finally {
    await dispose();
  }
});
