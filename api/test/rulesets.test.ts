import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { parseRuleset } from "../src/rulesets/schema";
import { canonicalJson, rulesetHash } from "../src/stamp/encoding";
import { demoRuleset } from "./fixtures/ruleset";

describe("parseRuleset", () => {
  it("accepts a complete ruleset", () => {
    expect(parseRuleset(demoRuleset)).toEqual(demoRuleset);
  });

  it("rejects unknown fields so nothing unhashed can slip in", () => {
    expect(() => parseRuleset({ ...demoRuleset, secretBoost: 2 })).toThrow();
  });

  it("rejects more than 20 sources", () => {
    const sources = Array.from({ length: 21 }, (_, i) => ({ handle: `kol${i}`, trustWeight: 0.5 }));
    expect(() => parseRuleset({ ...demoRuleset, sources })).toThrow();
  });

  it("rejects duplicate handles, ignoring case", () => {
    const sources = [
      { handle: "cobie", trustWeight: 0.9 },
      { handle: "Cobie", trustWeight: 0.1 },
    ];
    expect(() => parseRuleset({ ...demoRuleset, sources })).toThrow();
  });

  it("rejects trust weights outside 0..1", () => {
    const sources = [{ handle: "cobie", trustWeight: 1.5 }];
    expect(() => parseRuleset({ ...demoRuleset, sources })).toThrow();
  });

  it("rejects a non-integer effectiveFrom", () => {
    expect(() => parseRuleset({ ...demoRuleset, effectiveFrom: 1.5 })).toThrow();
  });

  it("rejects a promptHash that is not 32 bytes of hex", () => {
    const extraction = { ...demoRuleset.extraction, promptHash: "0x1234" };
    expect(() => parseRuleset({ ...demoRuleset, extraction })).toThrow();
  });
});

describe("rulesetHash", () => {
  it("is keccak256 of the canonical ruleset JSON", () => {
    expect(rulesetHash(demoRuleset)).toBe(keccak256(toBytes(canonicalJson(demoRuleset))));
  });

  it("ignores key order", () => {
    const reordered = Object.fromEntries(Object.entries(demoRuleset).reverse()) as typeof demoRuleset;
    expect(Object.keys(reordered)[0]).toBe("flags");
    expect(rulesetHash(reordered)).toBe(rulesetHash(demoRuleset));
  });

  it("changes when any rule changes", () => {
    const risk = { ...demoRuleset.risk, maxPositionPct: 6 };
    expect(rulesetHash({ ...demoRuleset, risk })).not.toBe(rulesetHash(demoRuleset));
  });
});
