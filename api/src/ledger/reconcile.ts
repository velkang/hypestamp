import { hexToString, type Hex } from "viem";
import * as repo from "../db";
import { bundleHash, parseStampRequest, type StampRequest } from "../stamp/bundle";
import { tweetHash } from "../stamp/encoding";

const STALE_AFTER_MS = 30 * 60_000;

export type StampedEvent = {
  bundleHash: Hex;
  rulesetHash: Hex;
  token: Hex; // bytes32 ticker
  entryPriceE8: bigint;
  txHash: Hex;
  blockNumber: bigint;
};

export type LedgerSource = {
  headBlock(): Promise<bigint>;
  stampedEvents(fromBlock: bigint, toBlock: bigint): Promise<StampedEvent[]>;
};

type ReconcileDeps = { db: D1Database; ledger: LedgerSource; now: number; startBlock: bigint };

export type ReconcileResult = { fromBlock: bigint; toBlock: bigint; stamped: number[]; failed: number[] };

// The CRE trigger is asynchronous, so a submitted trade is confirmed only when an
// EvidenceStamped event carries the bundleHash the trade reproduces from its own
// request, stored tweets and the event's attested entry price.
export async function reconcileStamps({ db, ledger, now, startBlock }: ReconcileDeps): Promise<ReconcileResult> {
  const last = await repo.lastSyncedBlock(db);
  const fromBlock = last === null ? startBlock : last + 1n;
  const toBlock = await ledger.headBlock();
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
    } else if (now - trade.submittedAt >= STALE_AFTER_MS) {
      await repo.markFailed(db, trade.id);
      failed.push(trade.id);
    }
  }

  if (fromBlock <= toBlock) await repo.setLastSyncedBlock(db, toBlock);
  return { fromBlock, toBlock, stamped, failed };
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
