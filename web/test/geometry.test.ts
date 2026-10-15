import { describe, expect, it } from "vitest";
import { buildTrack } from "../src/features/overview/track";
import { dotFor, xFor } from "../src/features/overview/timeline";
import type { FeedPost } from "../src/lib/types";

const S = 1000;
const committedAt = 1_000_000 * S;
const effective = committedAt + 180 * S;

const trade = (id: number, at: number, status: "submitted" | "stamped" | "failed") => ({ id, submittedAt: at, status });

describe("buildTrack", () => {
  it("puts commitment, refusals and in-force before the break, trades and now after it", () => {
    const track = buildTrack({
      committedAt,
      effectiveFrom: effective / S,
      trades: [trade(1, effective + 1200 * S, "stamped"), trade(0, committedAt + 90 * S, "failed")],
      now: effective + 1800 * S,
    });
    expect(track.before.map((s) => s.kind)).toEqual(["committed", "refused", "effective"]);
    expect(track.before.map((s) => s.position)).toEqual([0, 50, 100]);
    expect(track.after.map((s) => [s.kind, s.position])).toEqual([["trade", 66.7], ["now", 100]]);
  });

  it("keeps a minimum gap so neighbouring labels do not collide", () => {
    const track = buildTrack({
      committedAt,
      effectiveFrom: effective / S,
      trades: [trade(1, effective + 1000 * S, "stamped"), trade(2, effective + 1010 * S, "stamped")],
      now: effective + 1020 * S,
    });
    const positions = track.after.map((s) => s.position);
    expect(positions[1] - positions[0]).toBeGreaterThanOrEqual(18);
    expect(positions.at(-1)).toBe(100);
  });

  it("treats a failed trade after the rules took effect as a trade, not a cooldown refusal", () => {
    const track = buildTrack({ committedAt, effectiveFrom: effective / S, trades: [trade(3, effective + 60 * S, "failed")], now: effective + 600 * S });
    expect(track.before.map((s) => s.kind)).toEqual(["committed", "effective"]);
    expect(track.after[0]).toMatchObject({ kind: "trade", tradeId: 3, status: "failed" });
  });
});

const post = (extraction: Partial<NonNullable<FeedPost["extraction"]>> | null): FeedPost => ({
  id: "1", author: "a", text: "", createdAt: "", postedAt: 0, citedBy: [],
  extraction: extraction && { tweetId: "1", author: "a", postedAt: 0, mentions: [], isPromo: false, hasDisclosure: false, rationale: "", ...extraction },
});

describe("timeline geometry", () => {
  it("maps time linearly across the plot", () => {
    expect(xFor(150, { from: 100, to: 200 }, 140, 1000)).toBe(640);
  });

  it("styles a post by its strongest call, promotion, or no call", () => {
    expect(dotFor(post({ mentions: [{ token: "ETH", sentiment: 0.7, conviction: 0.8, urgency: 0 }] }))).toEqual({ kind: "bull", r: 8.8, label: "ETH 0.80" });
    expect(dotFor(post({ mentions: [{ token: "SOL", sentiment: -0.5, conviction: 0.5, urgency: 0 }] }))).toMatchObject({ kind: "bear", r: 7 });
    expect(dotFor(post({ isPromo: true }))).toEqual({ kind: "promo", r: 6, label: null });
    expect(dotFor(post({ isPromo: true, hasDisclosure: true }))).toEqual({ kind: "none", r: 4, label: null });
    expect(dotFor(post(null))).toEqual({ kind: "none", r: 4, label: null });
  });
});
