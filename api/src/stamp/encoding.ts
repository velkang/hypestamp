// Pure hashing shared with the CRE workflow (cre/stamp-workflow imports this file),
// so on-chain hashes match what the API computes. Keep it free of Hono and D1 imports.
import { encodeAbiParameters, keccak256, stringToHex, toBytes, type Hex } from "viem";
import type { Ruleset } from "../rulesets/schema";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type TweetFields = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot canonicalize non-finite number: ${value}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

// Like and retweet counts change between fetches, so only fields that never change
// are hashed; otherwise oracle nodes fetching at different moments would disagree.
export function tweetHash(tweet: TweetFields): Hex {
  const stable: { [key: string]: Json } = {
    id: tweet.id,
    author: tweet.author,
    text: tweet.text,
    createdAt: tweet.createdAt,
  };
  return keccak256(toBytes(canonicalJson(stable)));
}

// The ruleset's identity on-chain. Callers validate with parseRuleset first.
export function rulesetHash(ruleset: Ruleset): Hex {
  return keccak256(toBytes(canonicalJson(ruleset)));
}

// Report layouts must match HypestampLedger._processReport (contracts/src/HypestampLedger.sol).
export const ReportKind = { CommitRuleset: 0, StampEvidence: 1 } as const;
export const Side = { Long: 0, Short: 1 } as const;

export type StampEvidence = {
  bundleHash: Hex;
  rulesetHash: Hex;
  token: string;
  side: (typeof Side)[keyof typeof Side];
  entryPriceE8: bigint;
  verifiedTweets: number;
  flags: number;
};

export function encodeCommitRulesetReport(rulesetHash: Hex, effectiveFrom: number): Hex {
  return encodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes32" }, { type: "uint64" }],
    [ReportKind.CommitRuleset, rulesetHash, BigInt(effectiveFrom)],
  );
}

export function encodeStampEvidenceReport(evidence: StampEvidence): Hex {
  return encodeAbiParameters(
    [
      { type: "uint8" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint8" },
      { type: "uint256" },
      { type: "uint8" },
      { type: "uint16" },
    ],
    [
      ReportKind.StampEvidence,
      evidence.bundleHash,
      evidence.rulesetHash,
      stringToHex(evidence.token, { size: 32 }),
      evidence.side,
      evidence.entryPriceE8,
      evidence.verifiedTweets,
      evidence.flags,
    ],
  );
}
