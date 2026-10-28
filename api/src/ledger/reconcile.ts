import { hexToString, type Hex } from "viem";
import * as repo from "../db";
import * as rulesetStore from "../rulesets/store";
import { bundleHash, parseStampRequest, type StampRequest } from "../stamp/bundle";
import { tweetHash } from "../stamp/encoding";

const STALE_AFTER_MS = 30 * 60_000;

// Bounds RPC calls per run (rate limits, Workers' subrequest cap). After downtime the
// ledger catches up over several runs; progress is saved after each one.
export const MAX_BLOCKS_PER_RUN = 5_000n;

export type StampedEvent = {
  bundleHash: Hex;
  rulesetHash: Hex;
  token: Hex; // bytes32 ticker
  entryPriceE8: bigint;
  txHash: Hex;
  blockNumber: bigint;
};

export type CommittedRulesetEvent = { rulesetHash: string; txHash: string };

export type LedgerSource = {
  headBlock(): Promise<bigint>;
  stampedEvents(fromBlock: bigint, toBlock: bigint): Promise<StampedEvent[]>;
  committedRulesets(fromBlock: bigint, toBlock: bigint): Promise<CommittedRulesetEvent[]>;
};

type ReconcileDeps = { db: D1Database; ledger: LedgerSource; now: number; startBlock: bigint };

export type ReconcileResult = {
  fromBlock: bigint;
  toBlock: bigint;
  stamped: number[];
  failed: number[];
  confirmedRulesets: string[];
  failedRulesets: string[];
};

// The CRE trigger is asynchronous, so a submitted trade is confirmed only when an
// EvidenceStamped event carries the bundleHash the trade reproduces from its own
// request, stored tweets and the event's attested entry price.
export async function reconcileStamps({ db, ledger, now, startBlock }: ReconcileDeps): Promise<ReconcileResult> {
  const last = await repo.lastSyncedBlock(db);
  const fromBlock = last === null ? startBlock : last + 1n;
  const head = await ledger.headBlock();
  const toBlock = head < fromBlock + MAX_BLOCKS_PER_RUN - 1n ? head : fromBlock + MAX_BLOCKS_PER_RUN - 1n;
  // Timeouts only once every block up to the head has been read: an unread block may hold the event.
  const caughtUp = toBlock === head || fromBlock > head;
  const events = fromBlock <= toBlock ? await ledger.stampedEvents(fromBlock, toBlock) : [];

  const stamped: number[] = [];
  const failed: number[] = [];
  for (const trade of await repo.submittedTrades(db)) {
    const request = parseStampRequest(JSON.parse(trade.requestJson));
    const match = await findMatch(db, request, events);
    if (match) {
      await repo.markStamped(db, trade.id, {
        bundleHash: match.bundleHash,
        entryPriceE8: match.entryPriceE8.toString(),
        txHash: match.txHash,
        stampedAt: now,
      });
      stamped.push(trade.id);
    } else if (caughtUp && now - trade.submittedAt >= STALE_AFTER_MS) {
      await repo.markFailed(db, trade.id, "stamp-timeout");
      failed.push(trade.id);
    }
  }

  const rulesets = await reconcileRulesets(db, ledger, fromBlock, toBlock, now, caughtUp);
  if (fromBlock <= toBlock) await repo.setLastSyncedBlock(db, toBlock);
  return { fromBlock, toBlock, stamped, failed, ...rulesets };
}

async function findMatch(db: D1Database, request: StampRequest, events: StampedEvent[]) {
  const candidates = events.filter(
    (e) =>
      e.rulesetHash.toLowerCase() === request.rulesetHash.toLowerCase() &&
      hexToString(e.token, { size: 32 }) === request.signal.token,
  );
  if (candidates.length === 0) return null;

  const stored = new Map((await repo.tweetsByIds(db, request.tweetIds)).map((t) => [t.id, t]));
  if (stored.size !== request.tweetIds.length) return null;
  const tweetHashes = request.tweetIds.map((id) => ({ id, hash: tweetHash(stored.get(id)!) }));

  return candidates.find(
    (e) => bundleHash(request, tweetHashes, e.entryPriceE8).toLowerCase() === e.bundleHash.toLowerCase(),
  );
}

// Rulesets committed from the app are confirmed by their own on-chain event, never
// by the bridge's say-so; one that never lands is marked failed.
async function reconcileRulesets(db: D1Database, ledger: LedgerSource, fromBlock: bigint, toBlock: bigint, now: number, caughtUp: boolean) {
  const pending = await rulesetStore.pendingRulesets(db);
  const confirmedRulesets: string[] = [];
  const failedRulesets: string[] = [];
  if (pending.length === 0) return { confirmedRulesets, failedRulesets };

  const events = fromBlock <= toBlock ? await ledger.committedRulesets(fromBlock, toBlock) : [];
  for (const ruleset of pending) {
    const event = events.find((e) => e.rulesetHash.toLowerCase() === ruleset.hash.toLowerCase());
    if (event) {
      await rulesetStore.confirmRuleset(db, ruleset.hash, event.txHash);
      confirmedRulesets.push(ruleset.hash);
    } else if (caughtUp && rulesetStore.isStale(ruleset.committedAt, now)) {
      await rulesetStore.failRuleset(db, ruleset.hash);
      failedRulesets.push(ruleset.hash);
    }
  }
  return { confirmedRulesets, failedRulesets };
}
