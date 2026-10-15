import { describe, expect, it } from "vitest";
import { computeFlags, describeFlags, FLAG } from "../src/agent/flags";
import type { Extraction, Signal } from "../src/agent/types";
import { demoRuleset } from "./fixtures/ruleset";

// demoRuleset.flags: burstMinutes 15, burstMinKols 3, promoKeywords ["#ad", "sponsored", "partner"]
const MIN = 60_000;

const signal = (tweetIds: string[]): Signal => ({
  token: "LINK",
  side: "long",
  kols: tweetIds.map((tweetId, i) => ({ handle: `kol${i}`, trustWeight: 0.5, tweetId, sentiment: 0.7, conviction: 0.8 })),
  trustSum: 1.5,
  avgConviction: 0.8,
  explanation: "",
});

const extraction = (tweetId: string, postedAt: number, isPromo = false, hasDisclosure = false): Extraction => ({
  tweetId,
  author: `a${tweetId}`,
  postedAt,
  mentions: [],
  isPromo,
  hasDisclosure,
  rationale: "",
});

const tweet = (id: string, text = "gm") => ({ id, author: `a${id}`, text, createdAt: "" });

describe("computeFlags", () => {
  it("is 0 for independent, organic calls", () => {
    const extractions = [extraction("1", 0), extraction("2", 60 * MIN), extraction("3", 120 * MIN)];
    expect(computeFlags(demoRuleset, signal(["1", "2", "3"]), extractions, ["1", "2", "3"].map((id) => tweet(id)))).toBe(0);
  });

  it("flags undisclosed promotion in a cited tweet, but not disclosed promotion", () => {
    const ids = ["1", "2"];
    expect(computeFlags(demoRuleset, signal(ids), [extraction("1", 0, true, false), extraction("2", 0)], ids.map((id) => tweet(id)))).toBe(
      FLAG.UNDISCLOSED_PROMO,
    );
    expect(computeFlags(demoRuleset, signal(ids), [extraction("1", 0, true, true), extraction("2", 0)], ids.map((id) => tweet(id)))).toBe(0);
  });

  it("ignores promotion in tweets the signal does not cite", () => {
    const ids = ["1", "2"];
    const extractions = [extraction("1", 0), extraction("2", 0), extraction("9", 0, true, false)];
    expect(computeFlags(demoRuleset, signal(ids), extractions, ids.map((id) => tweet(id)))).toBe(0);
  });

  it("flags a coordinated burst when enough cited KOLs post within the burst window", () => {
    const ids = ["1", "2", "3"];
    const tight = [extraction("1", 0), extraction("2", 10 * MIN), extraction("3", 15 * MIN)];
    const spread = [extraction("1", 0), extraction("2", 10 * MIN), extraction("3", 15 * MIN + 1)];
    const tweets = ids.map((id) => tweet(id));
    expect(computeFlags(demoRuleset, signal(ids), tight, tweets)).toBe(FLAG.COORDINATED_BURST);
    expect(computeFlags(demoRuleset, signal(ids), spread, tweets)).toBe(0);
  });

  it("flags self-declared paid promotion by keyword, case-insensitively", () => {
    const ids = ["1", "2"];
    const tweets = [tweet("1", "Proud PARTNER of $LINK"), tweet("2")];
    expect(computeFlags(demoRuleset, signal(ids), [extraction("1", 0), extraction("2", 0)], tweets)).toBe(FLAG.PAID_MARKER);
  });

  it("combines flags as a bitmask", () => {
    const ids = ["1", "2", "3"];
    const extractions = [extraction("1", 0, true, false), extraction("2", MIN), extraction("3", 2 * MIN)];
    const tweets = [tweet("1", "#ad buy now"), tweet("2"), tweet("3")];
    expect(computeFlags(demoRuleset, signal(ids), extractions, tweets)).toBe(
      FLAG.UNDISCLOSED_PROMO | FLAG.COORDINATED_BURST | FLAG.PAID_MARKER,
    );
  });
});

describe("describeFlags", () => {
  it("names each set bit", () => {
    expect(describeFlags(0)).toEqual([]);
    expect(describeFlags(FLAG.UNDISCLOSED_PROMO | FLAG.PAID_MARKER)).toEqual(["undisclosed-promo", "paid-marker"]);
  });
});
