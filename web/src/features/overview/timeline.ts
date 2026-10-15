import type { FeedPost } from "../../lib/types";

export type DotKind = "bull" | "bear" | "promo" | "none";
export type Dot = { kind: DotKind; r: number; label: string | null };

export const xFor = (at: number, window: { from: number; to: number }, left: number, width: number) =>
  left + ((at - window.from) / (window.to - window.from)) * width;

// A post is drawn by its strongest call; undisclosed promotion without a call is a flag
// square; everything else is a small quiet dot. Size grows with conviction.
export function dotFor(post: FeedPost): Dot {
  const e = post.extraction;
  const calls = (e?.mentions ?? []).filter((m) => m.sentiment !== 0);
  if (calls.length > 0) {
    const top = calls.reduce((a, b) => (b.conviction > a.conviction ? b : a));
    return { kind: top.sentiment > 0 ? "bull" : "bear", r: 4 + top.conviction * 6, label: `${top.token} ${top.conviction.toFixed(2)}` };
  }
  if (e?.isPromo && !e.hasDisclosure) return { kind: "promo", r: 6, label: null };
  return { kind: "none", r: 4, label: null };
}
