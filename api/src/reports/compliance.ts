import * as repo from "../db";
import { replayTrade } from "../replay";

export type ComplianceReport = {
  generatedAt: string;
  activeRuleset: string | null;
  rulesets: number;
  trades: { total: number; submitted: number; stamped: number; failed: number };
  replay: { match: number; mismatch: number; pending: number };
  promotion: repo.PromotionStats[];
};

// Every trade is replayed, so the report states verified facts rather than stored claims.
export async function complianceReport(db: D1Database, now: number): Promise<ComplianceReport> {
  const [active, rulesets, trades] = await Promise.all([
    repo.activeRuleset(db, now),
    repo.countRulesets(db),
    repo.listTrades(db),
  ]);

  const replay = { match: 0, mismatch: 0, pending: 0 };
  for (const trade of trades) {
    const result = await replayTrade(db, trade.id);
    if (result) replay[result.verdict] += 1;
  }

  return {
    generatedAt: new Date(now).toISOString(),
    activeRuleset: active?.hash ?? null,
    rulesets,
    trades: {
      total: trades.length,
      submitted: trades.filter((t) => t.status === "submitted").length,
      stamped: trades.filter((t) => t.status === "stamped").length,
      failed: trades.filter((t) => t.status === "failed").length,
    },
    replay,
    promotion: active ? await repo.promotionStats(db, active.ruleset.extraction.promptHash) : [],
  };
}
