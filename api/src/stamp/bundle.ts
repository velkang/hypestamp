// The evidence bundle the agent asks the CRE workflow to stamp. Shared with
// cre/stamp-workflow, which validates the request and computes bundleHash itself
// from the tweets it fetched and the price it observed.
import { z } from "zod";
import { keccak256, toBytes, type Hex } from "viem";
import { canonicalJson, Side } from "./encoding";

const MAX_TWEETS = 10;
const hash32 = z.string().regex(/^0x[0-9a-f]{64}$/, "must be a 32-byte lowercase hex hash");
const percent = z.number().positive().max(100);

export const stampRequestSchema = z.strictObject({
  rulesetHash: hash32,
  signal: z.strictObject({
    token: z.string().regex(/^[A-Z0-9]{1,16}$/, "must be an uppercase ticker"),
    coingeckoId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    side: z.enum(["long", "short"]),
  }),
  // Numeric-only IDs: they are joined into the twitterapi.io query string.
  tweetIds: z
    .array(z.string().regex(/^\d{1,25}$/))
    .min(1)
    .max(MAX_TWEETS)
    .refine((ids) => new Set(ids).size === ids.length, "tweet IDs must be unique"),
  extractionsHash: hash32,
  trade: z.strictObject({
    sizePct: percent,
    stopLossPct: percent,
    takeProfitPct: z.number().positive(),
  }),
  flags: z.number().int().min(0).max(0xffff),
  observedAt: z.number().int().nonnegative(),
});

export type StampRequest = z.infer<typeof stampRequestSchema>;
export type VerifiedTweetHash = { id: string; hash: Hex };

export function parseStampRequest(input: unknown): StampRequest {
  return stampRequestSchema.parse(input);
}

export function sideCode(side: StampRequest["signal"]["side"]): (typeof Side)[keyof typeof Side] {
  return side === "long" ? Side.Long : Side.Short;
}

// tweetIds are replaced by the verified {id, hash} pairs, so the hash commits to tweet content.
export function bundleHash(request: StampRequest, tweets: VerifiedTweetHash[], entryPriceE8: bigint): Hex {
  const { tweetIds: _tweetIds, ...rest } = request;
  return keccak256(toBytes(canonicalJson({ ...rest, tweets, entryPriceE8: entryPriceE8.toString() })));
}
