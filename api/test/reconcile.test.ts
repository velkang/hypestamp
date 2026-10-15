import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringToHex, type Hex } from "viem";
import * as repo from "../src/db";
import { reconcileStamps, type StampedEvent } from "../src/ledger/reconcile";
import { bundleHash, type StampRequest } from "../src/stamp/bundle";
import { rulesetHash, tweetHash } from "../src/stamp/encoding";
import { createTestDb } from "./helpers/d1";
import { demoRuleset } from "./fixtures/ruleset";

const NOW = 1_800_000_000_000;
const RULES = rulesetHash(demoRuleset) as Hex;
const tweets = [
  { id: "201", author: "CryptoHayes", text: "Loading $LINK", createdAt: "Thu Oct 15 11:30:00 +0000 2026" },
  { id: "101", author: "cobie", text: "$LINK is the trade", createdAt: "Thu Oct 15 11:00:00 +0000 2026" },
];
const request: StampRequest = {
  rulesetHash: RULES,
  signal: { token: "LINK", coingeckoId: "chainlink", side: "long" },
  tweetIds: ["201", "101"],
  extractionsHash: `0x${"ab".repeat(32)}`,
  trade: { sizePct: 4, stopLossPct: 8, takeProfitPct: 20 },
  flags: 0,
  observedAt: 1_800_000_000,
};
const expectedBundle = bundleHash(
  request,
  tweets.map((t) => ({ id: t.id, hash: tweetHash(t) })),
  2_371_480_000n,
);

const event = (overrides: Partial<StampedEvent> = {}): StampedEvent => ({
  bundleHash: expectedBundle,
  rulesetHash: RULES,
  token: stringToHex("LINK", { size: 32 }),
  entryPriceE8: 2_371_480_000n,
  txHash: `0x${"cd".repeat(32)}`,
  blockNumber: 500n,
  ...overrides,
});

let db: D1Database;
let dispose: () => Promise<void>;
let tradeId: number;

beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
  await repo.saveRuleset(db, demoRuleset, RULES, 0);
  await repo.saveTweets(db, tweets, 0);
  tradeId = await repo.insertSubmittedTrade(db, {
    rulesetHash: RULES,
    token: "LINK",
    side: "long",
    requestJson: JSON.stringify(request),
    signalJson: "{}",
    submittedAt: NOW - 60_000,
  });
});
afterEach(() => dispose());

const source = (events: StampedEvent[], head = 600n) => ({
  headBlock: vi.fn().mockResolvedValue(head),
  stampedEvents: vi.fn().mockResolvedValue(events),
  committedRulesets: vi.fn().mockResolvedValue([]),
});

describe("reconcileStamps", () => {
  it("links a submitted trade to the event whose bundleHash it reproduces", async () => {
    const ledger = source([event({ bundleHash: `0x${"00".repeat(32)}` }), event()]);
    const result = await reconcileStamps({ db, ledger, now: NOW, startBlock: 400n });

    expect(result).toEqual({ fromBlock: 400n, toBlock: 600n, stamped: [tradeId], failed: [], confirmedRulesets: [], failedRulesets: [] });
    expect(ledger.stampedEvents).toHaveBeenCalledWith(400n, 600n);
    expect(await repo.submittedTrades(db)).toEqual([]);
    expect(await repo.lastSyncedBlock(db)).toBe(600n);
  });

  it("resumes after the last synced block", async () => {
    await repo.setLastSyncedBlock(db, 550n);
    const ledger = source([]);
    await reconcileStamps({ db, ledger, now: NOW, startBlock: 400n });
    expect(ledger.stampedEvents).toHaveBeenCalledWith(551n, 600n);
  });

  it("does not link an event with a different attested price", async () => {
    const ledger = source([event({ entryPriceE8: 1n })]);
    const result = await reconcileStamps({ db, ledger, now: NOW, startBlock: 400n });
    expect(result.stamped).toEqual([]);
    expect((await repo.submittedTrades(db)).map((t) => t.id)).toEqual([tradeId]);
  });

  it("fails trades still unmatched after 30 minutes, freeing the token", async () => {
    const result = await reconcileStamps({ db, ledger: source([]), now: NOW + 30 * 60_000, startBlock: 400n });
    expect(result.failed).toEqual([tradeId]);
    expect(await repo.openTradeTokens(db)).toEqual([]);
  });

  it("does nothing when there are no new blocks", async () => {
    await repo.setLastSyncedBlock(db, 600n);
    const ledger = source([]);
    const result = await reconcileStamps({ db, ledger, now: NOW, startBlock: 400n });
    expect(ledger.stampedEvents).not.toHaveBeenCalled();
    expect(result).toEqual({ fromBlock: 601n, toBlock: 600n, stamped: [], failed: [], confirmedRulesets: [], failedRulesets: [] });
  });
});
