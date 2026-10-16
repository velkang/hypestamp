import { z } from "zod";
import { HOUR_MS } from "../agent/cycle";
import { realizedPnl } from "../agent/exits";
import { describeFlags } from "../agent/flags";
import type { Extraction, SignalKol } from "../agent/types";
import { toTrade, type TradeDbRow, type PromotionStats } from "../db";
import { replayFromInputs, type ReplayResult } from "../replay";
import { parseRuleset, type Ruleset } from "../rulesets/schema";
import { parseStampRequest } from "../stamp/bundle";
import type { TweetFields } from "../stamp/encoding";

const DAY = 86_400_000;
const dayString = (time: number) => new Date(time).toISOString().slice(0, 10);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && dayString(time) === value;
}, "must be a valid UTC calendar date");
const rangeSchema = z.strictObject({ startDate: date, endDate: date });
export class ReportRangeError extends Error {}

export function reportPeriod(input: unknown, now: number) {
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) throw new ReportRangeError("Choose valid start and end dates (YYYY-MM-DD, UTC).");
  const { startDate, endDate } = parsed.data;
  if (startDate > endDate) throw new ReportRangeError("The start date must be on or before the end date.");
  if (endDate > dayString(now)) throw new ReportRangeError("Reports cannot include future dates.");
  const from = Date.parse(`${startDate}T00:00:00Z`);
  const to = Date.parse(`${endDate}T00:00:00Z`) + DAY;
  return { startDate, endDate, from, to, timeZone: "UTC" as const, partial: now < to };
}

export type SavedReport = {
  id: string;
  schemaVersion: 1;
  source: "daily" | "manual";
  generatedAt: string;
  period: ReturnType<typeof reportPeriod>;
  coverage: { demo: number; live: number };
  summary: {
    total: number; submitted: number; stamped: number; failed: number;
    replay: { match: number; mismatch: number; pending: number };
    flagged: Record<string, number>;
  };
  trades: {
    id: number; token: string; side: "long" | "short"; isDemo: boolean;
    submittedAt: number; status: "submitted" | "stamped" | "failed";
    rulesetHash: string; entryPriceE8: string | null; bundleHash: string | null; txHash: string | null;
    closedAt: number | null; exitPriceE8: string | null; exitPriceAt: number | null;
    exitReason: "stop-loss" | "take-profit" | null;
    pnl: ReturnType<typeof realizedPnl>; flags: string[]; explanation: string; kols: SignalKol[];
    replay: ReplayResult;
  }[];
  rulesets: { hash: string; ruleset: Ruleset; status: string; commitTx: string | null }[];
  promotion: PromotionStats[];
  methodology: { promotionPromptHash: string | null; tradeScope: string; outcomes: string; evidence: string };
};
export type ReportSummary = Pick<SavedReport, "id" | "schemaVersion" | "source" | "generatedAt" | "period" | "coverage" | "summary">;

type RuleRow = { hash: string; json: string; status: string; commit_tx: string | null; effective_from: number };
type PostRow = TweetFields & { postedAt: number; fetchedAt: number };
type ExtractionRow = { promptHash: string; json: string; postedAt: number; fetchedAt: number };

export async function getSavedReport(db: D1Database, id: string): Promise<SavedReport | null> {
  const row = await db.prepare("SELECT snapshot_json FROM reports WHERE id = ?").bind(id).first<{ snapshot_json: string }>();
  return row ? JSON.parse(row.snapshot_json) : null;
}

export async function listSavedReports(db: D1Database): Promise<ReportSummary[]> {
  const { results } = await db.prepare(`SELECT id, source, created_at,
    json_extract(snapshot_json, '$.period') AS period,
    json_extract(snapshot_json, '$.coverage') AS coverage,
    json_extract(snapshot_json, '$.summary') AS summary
    FROM reports ORDER BY created_at DESC, id DESC`).all<{
      id: string; source: SavedReport["source"]; created_at: number; period: string; coverage: string; summary: string;
    }>();
  return results.map((r) => ({ id: r.id, schemaVersion: 1, source: r.source, generatedAt: new Date(r.created_at).toISOString(),
    period: JSON.parse(r.period), coverage: JSON.parse(r.coverage), summary: JSON.parse(r.summary) }));
}

export async function generateReport(db: D1Database, input: unknown, now: number, source: SavedReport["source"] = "manual"): Promise<SavedReport> {
  const period = reportPeriod(input, now);
  const id = source === "daily" ? `daily-${period.startDate}` : crypto.randomUUID();
  if (source === "daily") {
    const existing = await getSavedReport(db, id);
    if (existing) return existing;
  }
  // D1 batch executes these reads in one transaction. All replay and aggregation
  // below use only this captured data, never another query to mutable evidence.
  const [tradeRows, ruleRows, postRows, extractionRows] = await db.batch([
    db.prepare("SELECT * FROM trades WHERE submitted_at >= ? AND submitted_at < ? AND submitted_at <= ? ORDER BY id DESC").bind(period.from, period.to, now),
    db.prepare("SELECT hash, json, status, commit_tx, effective_from FROM rulesets ORDER BY effective_from DESC"),
    db.prepare("SELECT id, author, text, created_at AS createdAt, posted_at AS postedAt, fetched_at AS fetchedAt FROM tweets WHERE fetched_at <= ?").bind(now),
    db.prepare(`SELECT e.prompt_hash AS promptHash, e.json, t.posted_at AS postedAt, t.fetched_at AS fetchedAt
      FROM extractions e JOIN tweets t ON t.id = e.tweet_id WHERE t.fetched_at <= ? ORDER BY t.posted_at, t.id`).bind(now),
  ]);
  const rules = ruleRows.results as unknown as RuleRow[];
  const posts = postRows.results as unknown as PostRow[];
  const extractions = extractionRows.results as unknown as ExtractionRow[];
  const summary: SavedReport["summary"] = { total: 0, submitted: 0, stamped: 0, failed: 0,
    replay: { match: 0, mismatch: 0, pending: 0 }, flagged: { "undisclosed-promo": 0, "coordinated-burst": 0, "paid-marker": 0 } };
  const coverage = { demo: 0, live: 0 };
  const usedRules = new Set<string>();
  const trades = (tradeRows.results as unknown as TradeDbRow[]).map((row) => {
    const trade = toTrade(row);
    const rule = rules.find((r) => r.hash === trade.rulesetHash);
    if (!rule) throw new Error(`Cannot capture report: ruleset missing for trade ${trade.id}`);
    const ruleset = parseRuleset(JSON.parse(rule.json));
    const request = parseStampRequest(JSON.parse(trade.requestJson));
    const asOf = request.observedAt * 1000;
    const inputs = extractions.filter((e) => e.promptHash === ruleset.extraction.promptHash &&
      e.postedAt >= asOf - ruleset.converge.windowHours * HOUR_MS && e.fetchedAt <= asOf).map((e) => JSON.parse(e.json) as Extraction);
    const replay = replayFromInputs(trade, rule.json, inputs, posts);
    const signal = JSON.parse(trade.signalJson) as { explanation: string; kols: SignalKol[] };
    const flags = describeFlags(request.flags);
    summary.total++;
    summary[trade.status]++;
    summary.replay[replay.verdict]++;
    for (const flag of flags) summary.flagged[flag]++;
    coverage[trade.isDemo ? "demo" : "live"]++;
    usedRules.add(rule.hash);
    return { id: trade.id, token: trade.token, side: trade.side, isDemo: trade.isDemo,
      submittedAt: trade.submittedAt, status: trade.status, rulesetHash: trade.rulesetHash,
      entryPriceE8: trade.entryPriceE8, bundleHash: trade.bundleHash, txHash: trade.txHash,
      closedAt: trade.closedAt, exitPriceE8: trade.exitPriceE8, exitPriceAt: trade.exitPriceAt, exitReason: trade.exitReason,
      pnl: realizedPnl(trade), flags, explanation: signal.explanation, kols: signal.kols, replay };
  });
  const active = rules.find((r) => r.status === "confirmed" && r.effective_from <= Math.floor(now / 1000));
  const promptHash = active ? parseRuleset(JSON.parse(active.json)).extraction.promptHash : null;
  const promotion = new Map<string, PromotionStats>();
  for (const row of extractions) {
    if (row.promptHash !== promptHash || row.postedAt < period.from || row.postedAt >= Math.min(period.to, now + 1)) continue;
    const e = JSON.parse(row.json) as Extraction;
    const author = e.author.toLowerCase();
    const tally = promotion.get(author) ?? { author: e.author, posts: 0, promo: 0, promoWithoutDisclosure: 0 };
    tally.posts++;
    tally.promo += Number(e.isPromo);
    tally.promoWithoutDisclosure += Number(e.isPromo && !e.hasDisclosure);
    promotion.set(author, tally);
  }
  const snapshot: SavedReport = {
    id, schemaVersion: 1, source, generatedAt: new Date(now).toISOString(), period, coverage, summary, trades,
    rulesets: rules.filter((r) => usedRules.has(r.hash)).map((r) => ({ hash: r.hash, ruleset: parseRuleset(JSON.parse(r.json)), status: r.status, commitTx: r.commit_tx })),
    promotion: [...promotion.values()].sort((a, b) => b.promoWithoutDisclosure - a.promoWithoutDisclosure || a.author.localeCompare(b.author)),
    methodology: { promotionPromptHash: promptHash,
      tradeScope: "Trades opened within the selected UTC dates, inclusive. Exits alone do not add earlier trades to this cohort.",
      outcomes: "Position outcomes and verification findings reflect the captured database state, not a reconstruction of an earlier day-end state.",
      evidence: "Source observations use the saved analysis under the prompt active at capture. Entry stamps attest evidence; paper exits are off-chain. Observations are not findings of wrongdoing." },
  };
  await db.prepare("INSERT INTO reports (id, schema_version, source, created_at, period_start, period_end, snapshot_json) VALUES (?, 1, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(id, source, now, period.from, period.to, JSON.stringify(snapshot)).run();
  // If two ticks race, both return the one persisted snapshot.
  return (await getSavedReport(db, id))!;
}

export async function ensureDailyReport(db: D1Database, now: number): Promise<{ id: string | null }> {
  const today = Math.floor(now / DAY) * DAY;
  if (now < today + 10 * 60_000) return { id: null };
  await db.prepare("INSERT INTO report_schedule (id, next_day) SELECT 1, COALESCE(MAX(period_end), ?) FROM reports WHERE source = 'daily' ON CONFLICT DO NOTHING").bind(today - DAY).run();
  const cursor = await db.prepare("SELECT next_day FROM report_schedule WHERE id = 1").first<{ next_day: number }>();
  const next = cursor!.next_day;
  if (next >= today) return { id: null };
  const day = dayString(next);
  const report = await generateReport(db, { startDate: day, endDate: day }, now, "daily");
  await db.prepare("UPDATE report_schedule SET next_day = ? WHERE id = 1 AND next_day = ?").bind(next + DAY, next).run();
  return { id: report.id };
}
