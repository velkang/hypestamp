import { z } from "zod";

const MAX_SOURCES = 20;

const unit = z.number().min(0).max(1);
const positive = z.number().positive();
const positiveInt = z.number().int().positive();
const percent = z.number().positive().max(100);

// Every object is strict: a field that is not in the schema would not be covered by
// the committed hash, so it is rejected rather than silently carried along.
const sourceSchema = z.strictObject({
  handle: z.string().regex(/^[A-Za-z0-9_]{1,15}$/, "must be an X handle without @"),
  trustWeight: unit,
});

export const rulesetSchema = z.strictObject({
  version: positiveInt,
  effectiveFrom: z.number().int().nonnegative(),
  sources: z
    .array(sourceSchema)
    .min(1)
    .max(MAX_SOURCES)
    .refine(
      (sources) => new Set(sources.map((s) => s.handle.toLowerCase())).size === sources.length,
      "handles must be unique",
    ),
  extraction: z.strictObject({
    model: z.string().min(1),
    promptHash: z.string().regex(/^0x[0-9a-f]{64}$/, "must be a 32-byte lowercase hex hash"),
    schemaVersion: positiveInt,
  }),
  converge: z.strictObject({
    minKols: positiveInt,
    windowHours: positive,
    minConviction: unit,
    minTrustSum: positive,
  }),
  risk: z.strictObject({
    maxPositionPct: percent,
    stopLossPct: percent,
    takeProfitPct: positive,
    maxOpen: positiveInt,
  }),
  flags: z.strictObject({
    burstMinutes: positive,
    burstMinKols: z.number().int().min(2),
    promoKeywords: z.array(z.string().min(1)),
  }),
});

export type Ruleset = z.infer<typeof rulesetSchema>;

export function parseRuleset(input: unknown): Ruleset {
  return rulesetSchema.parse(input);
}

// What a person edits: everything except effectiveFrom and the prompt hash, which
// are pinned at commit time (see prepareRuleset).
export const draftSchema = rulesetSchema.omit({ effectiveFrom: true, extraction: true }).extend({
  effectiveFrom: z.number().int().nonnegative().optional(),
  extraction: z.strictObject({ model: z.string().min(1), schemaVersion: z.number().int().positive() }),
});

export type RulesetDraft = z.infer<typeof draftSchema>;

export class RulesetValidationError extends Error {}

export function parseDraft(input: unknown): RulesetDraft {
  const result = draftSchema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".") || "ruleset"}: ${issue.message}`);
    throw new RulesetValidationError(problems.join("; "));
  }
  return result.data;
}
