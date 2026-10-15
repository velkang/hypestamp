import { keccak256, toBytes } from "viem";
import * as repo from "../db";
import type { StampRequest } from "../stamp/bundle";
import { canonicalJson } from "../stamp/encoding";
import { converge } from "./converge";
import { extractTweets, type ExtractionClient } from "./extract";
import { fetchSourceTweets } from "./ingest";
import { decideTrade, type Trade } from "./risk";
import type { Extraction, Signal } from "./types";

const HOUR_MS = 3_600_000;
const EXTRACTION_BATCH = 25;
const MAX_CITED_TWEETS = 10; // CRE consensus budget per stamp

export type CycleDeps = {
  db: D1Database;
  now: number; // epoch ms
  fetch: typeof globalThis.fetch;
  twitterApiKey: string;
  model: ExtractionClient;
  // Fire-and-forget: the CRE trigger is asynchronous; the result is reconciled from the ledger.
  submitStamp: (request: StampRequest) => Promise<void>;
};

export type CycleResult =
  | { status: "no-active-ruleset" }
  | { status: "ok"; newTweets: number; extracted: number; submitted: string[]; errors: string[] };

export async function runAgentCycle(deps: CycleDeps): Promise<CycleResult> {
  const active = await repo.activeRuleset(deps.db, deps.now);
  if (!active) return { status: "no-active-ruleset" };

  const { ruleset, hash } = active;
  const windowStart = deps.now - ruleset.converge.windowHours * HOUR_MS;
  const errors: string[] = [];

  const newTweets = await ingest(deps, ruleset.sources.map((s) => s.handle), windowStart, errors);
  const extracted = await extractPending(deps, ruleset, windowStart);

  const extractions = await repo.extractionsSince(deps.db, ruleset.extraction.promptHash, windowStart);
  const submitted: string[] = [];
  for (const signal of converge(ruleset, extractions, deps.now)) {
    const decision = decideTrade(ruleset, signal, await repo.openTradeTokens(deps.db));
    if (!decision.accepted) continue;
    const request = buildStampRequest(hash, signal, decision.trade, extractions, deps.now);
    const ok = await submitTrade(deps, hash, signal, request, errors);
    if (ok) submitted.push(signal.token);
  }

  return { status: "ok", newTweets, extracted, submitted, errors };
}

async function ingest(deps: CycleDeps, handles: string[], since: number, errors: string[]): Promise<number> {
  let stored = 0;
  for (const handle of handles) {
    try {
      const tweets = await fetchSourceTweets({ fetch: deps.fetch, apiKey: deps.twitterApiKey, handle, since });
      const before = await repo.tweetsByIds(deps.db, tweets.map((t) => t.id));
      await repo.saveTweets(deps.db, tweets, deps.now);
      stored += tweets.length - before.length;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return stored;
}

async function extractPending(deps: CycleDeps, ruleset: repo.ActiveRuleset["ruleset"], since: number) {
  const pending = await repo.tweetsNeedingExtraction(deps.db, ruleset.extraction.promptHash, since);
  for (let i = 0; i < pending.length; i += EXTRACTION_BATCH) {
    const batch = pending.slice(i, i + EXTRACTION_BATCH);
    const extractions = await extractTweets(deps.model, ruleset, batch);
    await repo.saveExtractions(deps.db, ruleset.extraction.promptHash, extractions);
  }
  return pending.length;
}

// Cites the most trusted KOLs' tweets (up to the CRE budget), kept in the signal's
// handle order so the request is deterministic for replay.
function citedTweetIds(signal: Signal): string[] {
  const top = [...signal.kols]
    .sort((a, b) => b.trustWeight - a.trustWeight || (a.handle < b.handle ? -1 : 1))
    .slice(0, MAX_CITED_TWEETS);
  return signal.kols.filter((k) => top.includes(k)).map((k) => k.tweetId);
}

function buildStampRequest(
  rulesetHash: string,
  signal: Signal,
  trade: Trade,
  extractions: Extraction[],
  now: number,
): StampRequest {
  const tweetIds = citedTweetIds(signal);
  const cited = extractions
    .filter((e) => tweetIds.includes(e.tweetId))
    .sort((a, b) => (a.tweetId < b.tweetId ? -1 : 1));
  return {
    rulesetHash,
    signal: { token: trade.token, coingeckoId: trade.coingeckoId, side: trade.side },
    tweetIds,
    extractionsHash: keccak256(toBytes(canonicalJson(cited))),
    trade: { sizePct: trade.sizePct, stopLossPct: trade.stopLossPct, takeProfitPct: trade.takeProfitPct },
    flags: 0,
    observedAt: Math.floor(now / 1000),
  };
}

// The trade is recorded before submission so a crash cannot lose a stamp in flight;
// a failed submission frees the token for a later cycle.
async function submitTrade(
  deps: CycleDeps,
  rulesetHash: string,
  signal: Signal,
  request: StampRequest,
  errors: string[],
): Promise<boolean> {
  const id = await repo.insertSubmittedTrade(deps.db, {
    rulesetHash,
    token: signal.token,
    side: signal.side,
    requestJson: JSON.stringify(request),
    signalJson: JSON.stringify(signal),
    submittedAt: deps.now,
  });
  try {
    await deps.submitStamp(request);
    return true;
  } catch (error) {
    await repo.markFailed(deps.db, id);
    errors.push(`${signal.token}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
