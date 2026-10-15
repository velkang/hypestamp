import type { Ruleset } from "./schema";

const STALE_AFTER_MS = 30 * 60_000;

// A ruleset submitted from the app waits here until its RulesetCommitted event is
// seen on-chain; activeRuleset only ever returns confirmed ones.
export async function savePendingRuleset(db: D1Database, ruleset: Ruleset, hash: string, submittedAt: number) {
  await db
    .prepare("INSERT INTO rulesets (hash, json, effective_from, committed_at, status) VALUES (?, ?, ?, ?, 'pending')")
    .bind(hash, JSON.stringify(ruleset), ruleset.effectiveFrom, submittedAt)
    .run();
}

export async function pendingRulesets(db: D1Database): Promise<{ hash: string; committedAt: number }[]> {
  const { results } = await db
    .prepare("SELECT hash, committed_at FROM rulesets WHERE status = 'pending' ORDER BY committed_at")
    .all<{ hash: string; committed_at: number }>();
  return results.map((r) => ({ hash: r.hash, committedAt: r.committed_at }));
}

export async function confirmRuleset(db: D1Database, hash: string, txHash: string) {
  await db.prepare("UPDATE rulesets SET status = 'confirmed', commit_tx = ? WHERE hash = ?").bind(txHash, hash).run();
}

export async function failRuleset(db: D1Database, hash: string) {
  await db.prepare("UPDATE rulesets SET status = 'failed' WHERE hash = ?").bind(hash).run();
}

export const isStale = (committedAt: number, now: number) => now - committedAt >= STALE_AFTER_MS;
