import type { Ruleset } from "../../lib/types";

// What a person edits; effectiveFrom and the prompt hash are pinned by the API.
export type Draft = Omit<Ruleset, "effectiveFrom" | "extraction"> & { extraction: { model: string; schemaVersion: number } };

const change = (label: string, before: string | number, after: string | number, unit = "") =>
  before === after ? [] : [`${label} ${before}${unit} → ${after}${unit}`];

function sourceChanges(before: Ruleset["sources"], after: Draft["sources"]): string[] {
  const key = (h: string) => h.toLowerCase();
  const old = new Map(before.map((s) => [key(s.handle), s]));
  const now = new Map(after.map((s) => [key(s.handle), s]));
  return [
    ...after.filter((s) => !old.has(key(s.handle))).map((s) => `+ @${s.handle} (trust ${s.trustWeight})`),
    ...before.filter((s) => !now.has(key(s.handle))).map((s) => `− @${s.handle}`),
    ...after.flatMap((s) => {
      const prev = old.get(key(s.handle));
      return prev && prev.trustWeight !== s.trustWeight ? [`@${s.handle} trust ${prev.trustWeight} → ${s.trustWeight}`] : [];
    }),
  ];
}

// Plain-language list of what a draft changes against the ruleset in force.
export function diffRulesets(active: Ruleset | undefined, draft: Draft): string[] {
  if (!active) return ["first ruleset: nothing in force to compare with"];
  const { converge: c0, risk: r0, flags: f0 } = active;
  const { converge: c1, risk: r1, flags: f1 } = draft;
  return [
    ...sourceChanges(active.sources, draft.sources),
    ...change("model", active.extraction.model, draft.extraction.model),
    ...change("sources needed", c0.minKols, c1.minKols),
    ...change("window", c0.windowHours, c1.windowHours, " h"),
    ...change("min conviction", c0.minConviction, c1.minConviction),
    ...change("min combined trust", c0.minTrustSum, c1.minTrustSum),
    ...change("max position", r0.maxPositionPct, r1.maxPositionPct, "%"),
    ...change("stop", r0.stopLossPct, r1.stopLossPct, "%"),
    ...change("target", r0.takeProfitPct, r1.takeProfitPct, "%"),
    ...change("max open", r0.maxOpen, r1.maxOpen),
    ...change("burst sources", f0.burstMinKols, f1.burstMinKols),
    ...change("burst window", f0.burstMinutes, f1.burstMinutes, " min"),
    ...change("paid markers", f0.promoKeywords.join(", "), f1.promoKeywords.join(", ")),
  ];
}
