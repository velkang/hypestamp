// Pure and deterministic: replay re-runs this on stamped extractions and must
// reproduce the same signals, so no clocks, randomness or locale-dependent sorting.
import type { Ruleset } from "../rulesets/schema";
import type { Extraction, Side, Signal, SignalKol } from "./types";

const HOUR_MS = 3_600_000;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sideOf(sentiment: number): Side | null {
  if (sentiment > 0) return "long";
  if (sentiment < 0) return "short";
  return null;
}

// Strongest mention wins: highest conviction, then most recent, then tweet ID.
function stronger(a: SignalKol & { postedAt: number }, b: SignalKol & { postedAt: number }) {
  if (a.conviction !== b.conviction) return a.conviction > b.conviction ? a : b;
  if (a.postedAt !== b.postedAt) return a.postedAt > b.postedAt ? a : b;
  return a.tweetId > b.tweetId ? a : b;
}

type Candidate = SignalKol & { postedAt: number };

// token -> side -> handle -> strongest qualifying mention
function collect(ruleset: Ruleset, extractions: Extraction[], now: number) {
  const trust = new Map(ruleset.sources.map((s) => [s.handle.toLowerCase(), s]));
  const windowStart = now - ruleset.converge.windowHours * HOUR_MS;
  const groups = new Map<string, Map<Side, Map<string, Candidate>>>();

  for (const extraction of extractions) {
    const source = trust.get(extraction.author.toLowerCase());
    if (!source || extraction.postedAt < windowStart || extraction.postedAt > now) continue;

    for (const mention of extraction.mentions) {
      const side = sideOf(mention.sentiment);
      if (!side || mention.conviction < ruleset.converge.minConviction) continue;

      const candidate: Candidate = {
        handle: source.handle,
        trustWeight: source.trustWeight,
        tweetId: extraction.tweetId,
        sentiment: mention.sentiment,
        conviction: mention.conviction,
        postedAt: extraction.postedAt,
      };
      const bySide = groups.get(mention.token) ?? new Map<Side, Map<string, Candidate>>();
      const byHandle = bySide.get(side) ?? new Map<string, Candidate>();
      const existing = byHandle.get(source.handle);
      byHandle.set(source.handle, existing ? stronger(existing, candidate) : candidate);
      bySide.set(side, byHandle);
      groups.set(mention.token, bySide);
    }
  }
  return groups;
}

function hasQuorum(ruleset: Ruleset, kols: SignalKol[]): boolean {
  const trustSum = round4(kols.reduce((sum, k) => sum + k.trustWeight, 0));
  return kols.length >= ruleset.converge.minKols && trustSum >= ruleset.converge.minTrustSum;
}

function toSignal(ruleset: Ruleset, token: string, side: Side, candidates: Candidate[]): Signal {
  const kols = candidates
    .map(({ postedAt: _postedAt, ...kol }) => kol)
    .sort((a, b) => byString(a.handle, b.handle));
  const trustSum = round4(kols.reduce((sum, k) => sum + k.trustWeight, 0));
  const avgConviction = round4(kols.reduce((sum, k) => sum + k.conviction, 0) / kols.length);
  const who = kols.map((k) => `${k.handle} ${k.trustWeight} conv ${k.conviction.toFixed(2)}`).join(", ");
  return {
    token,
    side,
    kols,
    trustSum,
    avgConviction,
    explanation:
      `${token} ${side}: ${kols.length} KOLs within ${ruleset.converge.windowHours}h (${who}); ` +
      `trust ${trustSum.toFixed(2)} >= ${ruleset.converge.minTrustSum}`,
  };
}

export function converge(ruleset: Ruleset, extractions: Extraction[], now: number): Signal[] {
  const signals: Signal[] = [];
  const groups = collect(ruleset, extractions, now);

  for (const token of [...groups.keys()].sort(byString)) {
    const bySide = groups.get(token)!;
    const long = [...(bySide.get("long")?.values() ?? [])];
    const short = [...(bySide.get("short")?.values() ?? [])];
    const longQuorum = hasQuorum(ruleset, long);
    const shortQuorum = hasQuorum(ruleset, short);

    // A contested narrative (both sides reach quorum) is not a signal.
    if (longQuorum && !shortQuorum) signals.push(toSignal(ruleset, token, "long", long));
    if (shortQuorum && !longQuorum) signals.push(toSignal(ruleset, token, "short", short));
  }
  return signals;
}
