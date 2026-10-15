import { describe, expect, it } from "vitest";
import { diffRulesets, type Draft } from "../src/features/compose/diff";
import { rulesetDetail } from "./helpers/fixtures";

const active = rulesetDetail.ruleset;
const same: Draft = {
  version: active.version, sources: active.sources, extraction: { model: active.extraction.model, schemaVersion: 1 },
  converge: active.converge, risk: active.risk, flags: active.flags,
};

describe("diffRulesets", () => {
  it("reports no changes for an identical draft", () => {
    expect(diffRulesets(active, same)).toEqual([]);
  });

  it("describes every changed rule in plain language", () => {
    const draft: Draft = {
      ...same,
      sources: [{ handle: "cobie", trustWeight: 0.7 }, { handle: "VitalikButerin", trustWeight: 0.8 }],
      extraction: { model: "gpt-6-sol", schemaVersion: 1 },
      converge: { ...same.converge, minKols: 3, windowHours: 6 },
      risk: { ...same.risk, maxPositionPct: 4, maxOpen: 2 },
      flags: { ...same.flags, promoKeywords: ["#ad", "paid"] },
    };
    expect(diffRulesets(active, draft)).toEqual([
      "+ @VitalikButerin (trust 0.8)",
      "− @CryptoHayes",
      "@cobie trust 0.9 → 0.7",
      "model gpt-6-luna → gpt-6-sol",
      "sources needed 2 → 3",
      "window 12 h → 6 h",
      "max position 5% → 4%",
      "max open 3 → 2",
      "paid markers #ad, sponsored → #ad, paid",
    ]);
  });

  it("treats everything as new when no ruleset is in force", () => {
    expect(diffRulesets(undefined, same)).toEqual(["first ruleset: nothing in force to compare with"]);
  });
});
