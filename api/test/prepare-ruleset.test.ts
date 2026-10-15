import { describe, expect, it } from "vitest";
import { extractionPromptHash } from "../src/agent/extract";
import { prepareRuleset } from "../src/rulesets/prepare";

const draft = {
  version: 1,
  sources: [{ handle: "cobie", trustWeight: 0.9 }],
  extraction: { model: "gpt-5.6-sol", schemaVersion: 1 },
  converge: { minKols: 1, windowHours: 12, minConviction: 0.6, minTrustSum: 0.5 },
  risk: { maxPositionPct: 5, stopLossPct: 8, takeProfitPct: 20, maxOpen: 3 },
  flags: { burstMinutes: 15, burstMinKols: 3, promoKeywords: [] },
};

describe("prepareRuleset", () => {
  it("pins the current extraction prompt and the earliest effectiveFrom the ledger accepts, plus margin", () => {
    const ruleset = prepareRuleset(draft, { chainNow: 1_000, cooldown: 120 });
    expect(ruleset.extraction.promptHash).toBe(extractionPromptHash());
    expect(ruleset.effectiveFrom).toBe(1_000 + 120 + 60);
  });

  it("keeps a later requested effectiveFrom", () => {
    expect(prepareRuleset({ ...draft, effectiveFrom: 5_000 }, { chainNow: 1_000, cooldown: 120 }).effectiveFrom).toBe(5_000);
  });

  it("validates the result against the ruleset schema", () => {
    expect(() => prepareRuleset({ ...draft, sources: [] }, { chainNow: 1_000, cooldown: 120 })).toThrow();
  });
});
