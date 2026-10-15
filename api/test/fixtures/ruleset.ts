import type { Ruleset } from "../../src/rulesets/schema";

export const demoRuleset: Ruleset = {
  version: 1,
  effectiveFrom: 1_792_000_000,
  sources: [
    { handle: "cobie", trustWeight: 0.9 },
    { handle: "CryptoHayes", trustWeight: 0.8 },
    { handle: "blknoiz06", trustWeight: 0.6 },
  ],
  extraction: {
    model: "claude-sonnet-5-5",
    promptHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    schemaVersion: 1,
  },
  converge: { minKols: 2, windowHours: 6, minConviction: 0.6, minTrustSum: 1.4 },
  risk: { maxPositionPct: 5, stopLossPct: 8, takeProfitPct: 20, maxOpen: 3 },
  flags: { burstMinutes: 15, burstMinKols: 3, promoKeywords: ["#ad", "sponsored", "partner"] },
};
