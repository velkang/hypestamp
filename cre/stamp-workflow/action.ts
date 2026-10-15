export type Action = { action: "commitRuleset"; ruleset: unknown } | { action: "stampEvidence"; request: unknown };

export function parseAction(input: unknown): Action {
  const action = (input as { action?: unknown } | null)?.action;
  if (action === "commitRuleset" || action === "stampEvidence") return input as Action;
  throw new Error(`Unknown action: ${String(action)}`);
}
