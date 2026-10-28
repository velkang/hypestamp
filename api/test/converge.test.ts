import { describe, expect, it } from "vitest";
import { agreementWindowStart, converge } from "../src/agent/converge";
import type { Extraction } from "../src/agent/types";
import { demoRuleset } from "./fixtures/ruleset";

// demoRuleset: cobie 0.9, CryptoHayes 0.8, blknoiz06 0.6; minKols 2, windowHours 6,
// minConviction 0.6, minTrustSum 1.4.
const NOW = Date.parse("2026-10-15T12:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3_600_000;

function extraction(author: string, at: number, token: string, sentiment: number, conviction = 0.8): Extraction {
  return {
    tweetId: `${author}-${token}-${at}`,
    author,
    postedAt: at,
    mentions: [{ token, sentiment, conviction, urgency: 0.5 }],
    isPromo: false,
    hasDisclosure: false,
    rationale: "",
  };
}

describe("converge", () => {
  it("fires when enough trusted KOLs agree on a token and side within the window", () => {
    const signals = converge(demoRuleset, [
      extraction("cobie", hoursAgo(1), "LINK", 0.7),
      extraction("CryptoHayes", hoursAgo(2), "LINK", 0.5),
    ], NOW);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ token: "LINK", side: "long", trustSum: 1.7 });
    expect(signals[0].kols.map((k) => k.handle)).toEqual(["CryptoHayes", "cobie"]);
    expect(signals[0].explanation).toBe(
      "LINK long: 2 KOLs within 6h (CryptoHayes 0.8 conv 0.80, cobie 0.9 conv 0.80); trust 1.70 >= 1.4",
    );
  });

  it("ignores authors who are not sources in the ruleset", () => {
    const signals = converge(demoRuleset, [
      extraction("cobie", hoursAgo(1), "LINK", 0.7),
      extraction("randomShill", hoursAgo(1), "LINK", 0.9),
    ], NOW);
    expect(signals).toEqual([]);
  });

  it("ignores mentions below the conviction threshold", () => {
    const signals = converge(demoRuleset, [
      extraction("cobie", hoursAgo(1), "LINK", 0.7),
      extraction("CryptoHayes", hoursAgo(1), "LINK", 0.7, 0.59),
    ], NOW);
    expect(signals).toEqual([]);
  });

  it("ignores mentions outside the window and in the future", () => {
    const signals = converge(demoRuleset, [
      extraction("cobie", hoursAgo(1), "LINK", 0.7),
      extraction("CryptoHayes", hoursAgo(6.01), "LINK", 0.7),
      extraction("blknoiz06", NOW + 60_000, "LINK", 0.7),
    ], NOW);
    expect(signals).toEqual([]);
  });

  it("ignores posts made before the ruleset took effect, even inside the window", () => {
    const rules = { ...demoRuleset, effectiveFrom: hoursAgo(1.5) / 1000 };
    const signals = converge(rules, [
      extraction("cobie", hoursAgo(1), "LINK", 0.7),
      extraction("CryptoHayes", hoursAgo(2), "LINK", 0.7),
    ], NOW);
    expect(signals).toEqual([]);
  });

  it("starts the agreement window at whichever is later: the window or the ruleset's effective time", () => {
    expect(agreementWindowStart({ ...demoRuleset, effectiveFrom: hoursAgo(1) / 1000 }, NOW)).toBe(hoursAgo(1));
    expect(agreementWindowStart({ ...demoRuleset, effectiveFrom: hoursAgo(24) / 1000 }, NOW)).toBe(hoursAgo(6));
  });

  it("counts each KOL once, using their strongest mention", () => {
    const signals = converge(demoRuleset, [
      extraction("cobie", hoursAgo(1), "LINK", 0.7, 0.7),
      extraction("cobie", hoursAgo(2), "LINK", 0.7, 0.95),
      extraction("CryptoHayes", hoursAgo(1), "LINK", 0.7),
    ], NOW);
    expect(signals[0].kols).toHaveLength(2);
    expect(signals[0].kols.find((k) => k.handle === "cobie")?.conviction).toBe(0.95);
  });

  it("requires the minimum trust sum, inclusive", () => {
    const pair = [extraction("CryptoHayes", hoursAgo(1), "LINK", 0.7), extraction("blknoiz06", hoursAgo(1), "LINK", 0.7)];
    expect(converge(demoRuleset, pair, NOW)).toHaveLength(1); // 0.8 + 0.6 = 1.4 >= 1.4
    const stricter = { ...demoRuleset, converge: { ...demoRuleset.converge, minTrustSum: 1.5 } };
    expect(converge(stricter, pair, NOW)).toEqual([]);
  });

  it("does not fire on a contested narrative where the other side also has a quorum", () => {
    const fourSources = {
      ...demoRuleset,
      sources: [...demoRuleset.sources, { handle: "DegenSpartan", trustWeight: 0.8 }],
    };
    const signals = converge(fourSources, [
      extraction("cobie", hoursAgo(1), "LINK", 0.7),
      extraction("CryptoHayes", hoursAgo(1), "LINK", 0.7),
      extraction("blknoiz06", hoursAgo(1), "LINK", -0.7),
      extraction("DegenSpartan", hoursAgo(1), "LINK", -0.7),
    ], NOW);
    expect(signals).toEqual([]);
  });

  it("treats negative sentiment as short and ignores neutral mentions", () => {
    const signals = converge(demoRuleset, [
      extraction("cobie", hoursAgo(1), "ETH", -0.6),
      extraction("CryptoHayes", hoursAgo(1), "ETH", -0.4),
      extraction("blknoiz06", hoursAgo(1), "ETH", 0),
    ], NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ token: "ETH", side: "short" });
    expect(signals[0].kols).toHaveLength(2);
  });

  it("returns signals sorted by token so replay is deterministic", () => {
    const input = [
      extraction("cobie", hoursAgo(1), "SOL", 0.7),
      extraction("CryptoHayes", hoursAgo(1), "SOL", 0.7),
      extraction("cobie", hoursAgo(1), "ETH", 0.7),
      extraction("CryptoHayes", hoursAgo(1), "ETH", 0.7),
    ];
    expect(converge(demoRuleset, input, NOW).map((s) => s.token)).toEqual(["ETH", "SOL"]);
    expect(converge(demoRuleset, [...input].reverse(), NOW)).toEqual(converge(demoRuleset, input, NOW));
  });
});
