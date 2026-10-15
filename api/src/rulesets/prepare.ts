import { extractionPromptHash } from "../agent/extract";
import { parseRuleset, type Ruleset } from "./schema";

// Slack for the time the commit spends in the CRE bridge queue before it lands.
const SUBMISSION_MARGIN_S = 60;

type Draft = Omit<Ruleset, "effectiveFrom" | "extraction"> & {
  effectiveFrom?: number;
  extraction: Omit<Ruleset["extraction"], "promptHash">;
};

// Turns an editable draft into the exact ruleset to commit: it pins the extraction
// prompt in use and an effectiveFrom the ledger's cooldown will accept.
export function prepareRuleset(draft: Draft, chain: { chainNow: number; cooldown: number }): Ruleset {
  const earliest = chain.chainNow + chain.cooldown + SUBMISSION_MARGIN_S;
  return parseRuleset({
    ...draft,
    effectiveFrom: Math.max(draft.effectiveFrom ?? 0, earliest),
    extraction: { ...draft.extraction, promptHash: extractionPromptHash() },
  });
}
