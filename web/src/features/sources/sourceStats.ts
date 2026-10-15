import type { FeedPost } from "../../lib/types";

export type SourceStats = {
  handle: string;
  trustWeight: number;
  posts: number;
  bullish: number;
  bearish: number;
  undisclosedPromo: number;
  cited: number;
  lastPostAt: number | null;
};

// Per-source tally over the feed window; handles match case-insensitively like the agent.
export function sourceStats(sources: { handle: string; trustWeight: number }[], posts: FeedPost[]): SourceStats[] {
  return sources.map(({ handle, trustWeight }) => {
    const mine = posts.filter((p) => p.author.toLowerCase() === handle.toLowerCase());
    const calls = mine.flatMap((p) => p.extraction?.mentions ?? []);
    return {
      handle,
      trustWeight,
      posts: mine.length,
      bullish: calls.filter((m) => m.sentiment > 0).length,
      bearish: calls.filter((m) => m.sentiment < 0).length,
      undisclosedPromo: mine.filter((p) => p.extraction?.isPromo && !p.extraction.hasDisclosure).length,
      cited: mine.filter((p) => p.citedBy.length > 0).length,
      lastPostAt: mine.length ? Math.max(...mine.map((p) => p.postedAt)) : null,
    };
  });
}
