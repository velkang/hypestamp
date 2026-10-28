// Re-derives a trade from stored inputs to show it followed its pre-committed rules.
import type { Extraction } from "./agent/types";
import type { TweetFields } from "./stamp/encoding";
import { buildStampRequest } from "./agent/cycle";
import { agreementWindowStart, converge } from "./agent/converge";
import { decideTrade } from "./agent/risk";
import * as repo from "./db";
import { parseRuleset, type Ruleset } from "./rulesets/schema";
import { bundleHash, parseStampRequest, type StampRequest } from "./stamp/bundle";
import { canonicalJson, rulesetHash, tweetHash } from "./stamp/encoding";

export type CheckStatus = "pass" | "fail" | "pending";
export type ReplayCheck = { name: "ruleset" | "signal" | "request" | "bundle"; status: CheckStatus; detail: string };
export type ReplayResult = { tradeId: number; verdict: "match" | "mismatch" | "pending"; checks: ReplayCheck[] };

export async function replayTrade(db: D1Database, tradeId: number): Promise<ReplayResult | null> {
  const trade = await repo.getTrade(db, tradeId);
  if (!trade) return null;

  const rulesetJson = await repo.rulesetJsonByHash(db, trade.rulesetHash);
  if (!rulesetJson) throw new Error(`Ruleset ${trade.rulesetHash} for trade ${tradeId} is missing`);
  const ruleset = parseRuleset(JSON.parse(rulesetJson));
  const request = parseStampRequest(JSON.parse(trade.requestJson));
  const asOf = request.observedAt * 1000;
  const extractions = await repo.extractionsSince(db, ruleset.extraction.promptHash, agreementWindowStart(ruleset, asOf), asOf);
  const tweets = await repo.tweetsByIds(db, [...new Set([...request.tweetIds, ...extractions.map((e) => e.tweetId)])]);
  return replayFromInputs(trade, rulesetJson, extractions, tweets);
}

// Both live replay and saved reports use this deterministic engine. Reports pass
// captured rows, so generation never mixes a frozen trade with changing inputs.
export function replayFromInputs(trade: repo.TradeRow, rulesetJson: string, extractions: Extraction[], tweets: TweetFields[]): ReplayResult {
  const ruleset = parseRuleset(JSON.parse(rulesetJson));
  const request = parseStampRequest(JSON.parse(trade.requestJson));
  const checks: ReplayCheck[] = [
    checkRuleset(ruleset, trade.rulesetHash),
    ...checkDecision(ruleset, trade.rulesetHash, request, trade.openTokens, extractions, tweets),
    checkBundle(request, trade, tweets),
  ];
  const verdict = checks.some((c) => c.status === "fail") ? "mismatch"
    : checks.some((c) => c.status === "pending") ? "pending" : "match";
  return { tradeId: trade.id, verdict, checks };
}

function checkRuleset(ruleset: Ruleset, committedHash: string): ReplayCheck {
  const hash = rulesetHash(ruleset);
  return hash === committedHash
    ? { name: "ruleset", status: "pass", detail: `stored ruleset hashes to the committed ${committedHash}` }
    : { name: "ruleset", status: "fail", detail: `stored ruleset hashes to ${hash}, not the committed ${committedHash}` };
}

// Converge and risk are re-run on exactly the extractions the agent had at observedAt.
function checkDecision(
  ruleset: Ruleset,
  hash: string,
  request: StampRequest,
  openTokens: string[] | null,
  extractions: Extraction[],
  tweets: TweetFields[],
): ReplayCheck[] {
  const asOf = request.observedAt * 1000;
  const signal = converge(ruleset, extractions, asOf).find(
    (s) => s.token === request.signal.token && s.side === request.signal.side,
  );
  if (!signal) {
    return [
      { name: "signal", status: "fail", detail: `no ${request.signal.token} ${request.signal.side} signal under these rules` },
      { name: "request", status: "fail", detail: "nothing to rebuild without the signal" },
    ];
  }

  const signalCheck: ReplayCheck = { name: "signal", status: "pass", detail: signal.explanation };
  const legacy = !request.riskContextHash;
  if (!legacy && (openTokens === null || !Array.isArray(openTokens) || !openTokens.every((t) => typeof t === "string"))) {
    return [signalCheck, { name: "request", status: "fail", detail: "The committed risk-context inputs are missing or invalid." }];
  }
  // Legacy requests can still reproduce their sizing, but never pass risk
  // verification without the historical positions that drove the decision.
  const decision = decideTrade(ruleset, signal, legacy ? [] : openTokens!);
  if (!decision.accepted) return [signalCheck, { name: "request", status: "fail", detail: decision.reason }];

  const rebuilt = buildStampRequest(ruleset, hash, signal, decision.trade, extractions, tweets, asOf, legacy ? undefined : openTokens!);
  return [
    signalCheck,
    canonicalJson(rebuilt) === canonicalJson(request)
      ? legacy
        ? { name: "request", status: "pending", detail: "Request rebuilds, but historical open-position inputs were not saved in this older trade; risk limits cannot be verified." }
        : { name: "request", status: "pass", detail: "rebuilt stamp request is identical, including extraction and risk-context hashes" }
      : { name: "request", status: "fail", detail: "rebuilt stamp request differs from the one submitted" },
  ];
}

function checkBundle(request: StampRequest, trade: repo.TradeRow, storedTweets: TweetFields[]): ReplayCheck {
  if (!trade.bundleHash || !trade.entryPriceE8) {
    return { name: "bundle", status: "pending", detail: "not stamped on-chain yet" };
  }
  const tweets = new Map(storedTweets.map((t) => [t.id, t]));
  const hashes = request.tweetIds.map((id) => {
    const tweet = tweets.get(id);
    return { id, hash: tweet ? tweetHash(tweet) : ("0x" as const) };
  });
  const recomputed = bundleHash(request, hashes, BigInt(trade.entryPriceE8));
  const record = trade.isDemo ? "stored demo bundle" : "on-chain";
  return recomputed.toLowerCase() === trade.bundleHash.toLowerCase()
    ? { name: "bundle", status: "pass", detail: `recomputes to the ${record} ${trade.bundleHash}` }
    : { name: "bundle", status: "fail", detail: `recomputes to ${recomputed}, ${record} record is ${trade.bundleHash}` };
}
