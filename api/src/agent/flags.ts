// Evidence flags written into each stamp's uint16 bitmask. Pure and driven only by
// the ruleset's committed flag rules, so replay reproduces them exactly. Flags are
// recorded, not blocking: the trade still happens and the flag is the evidence.
import type { Ruleset } from "../rulesets/schema";
import type { TweetFields } from "../stamp/encoding";
import type { Extraction, Signal } from "./types";

export const FLAG = {
  UNDISCLOSED_PROMO: 1 << 0, // a cited tweet reads as promotion without a disclosure
  COORDINATED_BURST: 1 << 1, // burstMinKols cited KOLs posted within burstMinutes
  PAID_MARKER: 1 << 2, // a cited tweet carries a committed paid-promotion keyword
} as const;

const NAMES: [number, string][] = [
  [FLAG.UNDISCLOSED_PROMO, "undisclosed-promo"],
  [FLAG.COORDINATED_BURST, "coordinated-burst"],
  [FLAG.PAID_MARKER, "paid-marker"],
];

const MINUTE_MS = 60_000;

export function computeFlags(
  ruleset: Ruleset,
  signal: Signal,
  extractions: Extraction[],
  tweets: TweetFields[],
): number {
  const cited = new Set(signal.kols.map((k) => k.tweetId));
  const citedExtractions = extractions.filter((e) => cited.has(e.tweetId));
  const citedTweets = tweets.filter((t) => cited.has(t.id));

  let flags = 0;
  if (citedExtractions.some((e) => e.isPromo && !e.hasDisclosure)) flags |= FLAG.UNDISCLOSED_PROMO;
  if (hasBurst(citedExtractions.map((e) => e.postedAt), ruleset)) flags |= FLAG.COORDINATED_BURST;
  if (hasPaidMarker(citedTweets, ruleset.flags.promoKeywords)) flags |= FLAG.PAID_MARKER;
  return flags;
}

// Sliding window over sorted post times: any burstMinKols posts within burstMinutes.
function hasBurst(postedAt: number[], ruleset: Ruleset): boolean {
  const { burstMinKols, burstMinutes } = ruleset.flags;
  const times = [...postedAt].sort((a, b) => a - b);
  for (let end = burstMinKols - 1; end < times.length; end++) {
    if (times[end] - times[end - burstMinKols + 1] <= burstMinutes * MINUTE_MS) return true;
  }
  return false;
}

function hasPaidMarker(tweets: TweetFields[], keywords: string[]): boolean {
  const lowered = keywords.map((k) => k.toLowerCase());
  return tweets.some((t) => lowered.some((k) => t.text.toLowerCase().includes(k)));
}

export function describeFlags(flags: number): string[] {
  return NAMES.filter(([bit]) => (flags & bit) !== 0).map(([, name]) => name);
}
