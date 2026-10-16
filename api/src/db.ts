import { parseRuleset, type Ruleset } from './rulesets/schema'
import type { Extraction, Side } from './agent/types'
import type { TweetFields } from './stamp/encoding'

export type ActiveRuleset = { hash: `0x${string}`; ruleset: Ruleset }

export async function saveRuleset(
  db: D1Database,
  ruleset: Ruleset,
  hash: string,
  committedAt: number,
) {
  await db
    .prepare(
      'INSERT OR IGNORE INTO rulesets (hash, json, effective_from, committed_at) VALUES (?, ?, ?, ?)',
    )
    .bind(hash, JSON.stringify(ruleset), ruleset.effectiveFrom, committedAt)
    .run()
}

// The latest ruleset whose effectiveFrom has passed: the one the ledger treats as active.
export async function activeRuleset(
  db: D1Database,
  nowMs: number,
): Promise<ActiveRuleset | null> {
  const row = await db
    .prepare(
      "SELECT hash, json FROM rulesets WHERE effective_from <= ? AND status = 'confirmed' ORDER BY effective_from DESC LIMIT 1",
    )
    .bind(Math.floor(nowMs / 1000))
    .first<{ hash: `0x${string}`; json: string }>()
  return row
    ? { hash: row.hash, ruleset: parseRuleset(JSON.parse(row.json)) }
    : null
}

export async function saveTweets(
  db: D1Database,
  tweets: TweetFields[],
  fetchedAt: number,
) {
  if (tweets.length === 0) return
  const insert = db.prepare(
    'INSERT OR IGNORE INTO tweets (id, author, text, created_at, posted_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  await db.batch(
    tweets.map((t) =>
      insert.bind(
        t.id,
        t.author,
        t.text,
        t.createdAt,
        Date.parse(t.createdAt),
        fetchedAt,
      ),
    ),
  )
}

type TweetRow = { id: string; author: string; text: string; created_at: string }
const toTweet = (row: TweetRow): TweetFields => ({
  id: row.id,
  author: row.author,
  text: row.text,
  createdAt: row.created_at,
})

export async function tweetsNeedingExtraction(
  db: D1Database,
  promptHash: string,
  sinceMs: number,
) {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.author, t.text, t.created_at FROM tweets t
       LEFT JOIN extractions e ON e.tweet_id = t.id AND e.prompt_hash = ?
       WHERE e.tweet_id IS NULL AND t.posted_at >= ? ORDER BY t.posted_at, t.id`,
    )
    .bind(promptHash, sinceMs)
    .all<TweetRow>()
  return results.map(toTweet)
}

export async function tweetsByIds(
  db: D1Database,
  ids: string[],
): Promise<TweetFields[]> {
  if (ids.length === 0) return []
  const { results } = await db
    .prepare(
      `SELECT id, author, text, created_at FROM tweets WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .bind(...ids)
    .all<TweetRow>()
  return results.map(toTweet)
}

export async function saveExtractions(
  db: D1Database,
  promptHash: string,
  extractions: Extraction[],
) {
  if (extractions.length === 0) return
  const insert = db.prepare(
    'INSERT OR IGNORE INTO extractions (tweet_id, prompt_hash, json) VALUES (?, ?, ?)',
  )
  await db.batch(
    extractions.map((e) =>
      insert.bind(e.tweetId, promptHash, JSON.stringify(e)),
    ),
  )
}

// asOf limits to tweets the agent had already fetched by then, so replay sees the
// same inputs the original decision did.
export async function extractionsSince(
  db: D1Database,
  promptHash: string,
  sinceMs: number,
  asOfMs: number = Number.MAX_SAFE_INTEGER,
): Promise<Extraction[]> {
  const { results } = await db
    .prepare(
      `SELECT e.json FROM extractions e JOIN tweets t ON t.id = e.tweet_id
       WHERE e.prompt_hash = ? AND t.posted_at >= ? AND t.fetched_at <= ? ORDER BY t.posted_at, t.id`,
    )
    .bind(promptHash, sinceMs, asOfMs)
    .all<{ json: string }>();
  return results.map((row) => JSON.parse(row.json) as Extraction);
}

export type NewTrade = {
  rulesetHash: string
  token: string
  side: Side
  requestJson: string
  signalJson: string
  submittedAt: number
  openTokens?: string[]
}

export async function insertSubmittedTrade(
  db: D1Database,
  trade: NewTrade,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO trades (ruleset_hash, token, side, request_json, signal_json, status, submitted_at, open_tokens_json)
       VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?) RETURNING id`,
    )
    .bind(
      trade.rulesetHash,
      trade.token,
      trade.side,
      trade.requestJson,
      trade.signalJson,
      trade.submittedAt,
      trade.openTokens === undefined ? null : JSON.stringify(trade.openTokens),
    )
    .first<{ id: number }>()
  if (!row) throw new Error('Failed to record submitted trade')
  return row.id
}

// Submitted trades count as open so a second signal cannot double up while the
// stamp is in flight.
export async function openTradeTokens(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT token FROM trades WHERE status IN ('submitted', 'stamped') AND closed_at IS NULL AND is_demo = 0 ORDER BY id",
    )
    .all<{ token: string }>()
  return results.map((row) => row.token)
}

export type SubmittedTrade = {
  id: number
  rulesetHash: string
  requestJson: string
  submittedAt: number
}

export async function submittedTrades(
  db: D1Database,
): Promise<SubmittedTrade[]> {
  const { results } = await db
    .prepare(
      "SELECT id, ruleset_hash, request_json, submitted_at FROM trades WHERE status = 'submitted' ORDER BY id",
    )
    .all<{
      id: number
      ruleset_hash: string
      request_json: string
      submitted_at: number
    }>()
  return results.map((row) => ({
    id: row.id,
    rulesetHash: row.ruleset_hash,
    requestJson: row.request_json,
    submittedAt: row.submitted_at,
  }))
}

export type StampRecord = {
  bundleHash: string
  entryPriceE8: string
  txHash: string
  stampedAt: number
}

export async function markStamped(
  db: D1Database,
  id: number,
  stamp: StampRecord,
) {
  await db
    .prepare(
      "UPDATE trades SET status = 'stamped', bundle_hash = ?, entry_price_e8 = ?, tx_hash = ?, stamped_at = ? WHERE id = ?",
    )
    .bind(
      stamp.bundleHash,
      stamp.entryPriceE8,
      stamp.txHash,
      stamp.stampedAt,
      id,
    )
    .run()
}

export async function markFailed(db: D1Database, id: number, reason: "submission-failed" | "stamp-timeout" = "submission-failed") {
  await db
    .prepare("UPDATE trades SET status = 'failed', failure_reason = ? WHERE id = ?")
    .bind(reason, id)
    .run()
}

export async function lastSyncedBlock(db: D1Database): Promise<bigint | null> {
  const row = await db
    .prepare('SELECT last_block FROM ledger_sync WHERE id = 1')
    .first<{ last_block: number }>()
  return row ? BigInt(row.last_block) : null
}

export async function setLastSyncedBlock(db: D1Database, block: bigint) {
  await db
    .prepare(
      'INSERT INTO ledger_sync (id, last_block) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET last_block = excluded.last_block',
    )
    .bind(Number(block))
    .run()
}

export async function rulesetJsonByHash(db: D1Database, hash: string): Promise<string | null> {
  const row = await db.prepare("SELECT json FROM rulesets WHERE hash = ?").bind(hash).first<{ json: string }>();
  return row?.json ?? null;
}

export type TradeRow = {
  id: number;
  rulesetHash: string;
  token: string;
  side: Side;
  status: "submitted" | "stamped" | "failed";
  requestJson: string;
  signalJson: string;
  bundleHash: string | null;
  entryPriceE8: string | null;
  txHash: string | null;
  submittedAt: number;
  stampedAt: number | null;
  isDemo: boolean;
  openTokens: string[] | null;
  failureReason: "submission-failed" | "stamp-timeout" | null;
  closedAt: number | null;
  exitPriceE8: string | null;
  exitPriceAt: number | null;
  exitReason: "stop-loss" | "take-profit" | null;
};

export type TradeDbRow = {
  id: number;
  ruleset_hash: string;
  token: string;
  side: Side;
  status: TradeRow["status"];
  request_json: string;
  signal_json: string;
  bundle_hash: string | null;
  entry_price_e8: string | null;
  tx_hash: string | null;
  submitted_at: number;
  stamped_at: number | null;
  is_demo: number;
  open_tokens_json: string | null;
  failure_reason: TradeRow["failureReason"];
  closed_at: number | null;
  exit_price_e8: string | null;
  exit_price_at: number | null;
  exit_reason: TradeRow["exitReason"];
};

export const toTrade = (row: TradeDbRow): TradeRow => ({
  id: row.id,
  rulesetHash: row.ruleset_hash,
  token: row.token,
  side: row.side,
  status: row.status,
  requestJson: row.request_json,
  signalJson: row.signal_json,
  bundleHash: row.bundle_hash,
  entryPriceE8: row.entry_price_e8,
  txHash: row.tx_hash,
  submittedAt: row.submitted_at,
  stampedAt: row.stamped_at,
  isDemo: row.is_demo === 1,
  openTokens: row.open_tokens_json === null ? null : JSON.parse(row.open_tokens_json),
  failureReason: row.failure_reason,
  closedAt: row.closed_at,
  exitPriceE8: row.exit_price_e8,
  exitPriceAt: row.exit_price_at,
  exitReason: row.exit_reason,
});

export async function getTrade(db: D1Database, id: number): Promise<TradeRow | null> {
  const row = await db.prepare("SELECT * FROM trades WHERE id = ?").bind(id).first<TradeDbRow>();
  return row ? toTrade(row) : null;
}

export async function listTrades(db: D1Database): Promise<TradeRow[]> {
  const { results } = await db.prepare("SELECT * FROM trades ORDER BY id DESC").all<TradeDbRow>();
  return results.map(toTrade);
}

export async function countRulesets(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM rulesets").first<{ n: number }>();
  return row?.n ?? 0;
}

export type PromotionStats = { author: string; posts: number; promo: number; promoWithoutDisclosure: number };

// Per-author promotion tally from extractions made under one prompt.
export async function promotionStats(db: D1Database, promptHash: string): Promise<PromotionStats[]> {
  const { results } = await db
    .prepare(
      `SELECT t.author AS author,
              COUNT(*) AS posts,
              SUM(json_extract(e.json, '$.isPromo')) AS promo,
              SUM(json_extract(e.json, '$.isPromo') AND NOT json_extract(e.json, '$.hasDisclosure')) AS undisclosed
       FROM extractions e JOIN tweets t ON t.id = e.tweet_id
       WHERE e.prompt_hash = ?
       GROUP BY t.author
       ORDER BY undisclosed DESC, promo DESC, t.author`,
    )
    .bind(promptHash)
    .all<{ author: string; posts: number; promo: number; undisclosed: number }>();
  return results.map((r) => ({ author: r.author, posts: r.posts, promo: r.promo, promoWithoutDisclosure: r.undisclosed }));
}

export async function listRulesets(db: D1Database) {
  const { results } = await db
    .prepare("SELECT hash, json, effective_from, committed_at, status, commit_tx FROM rulesets ORDER BY effective_from DESC")
    .all<{ hash: string; json: string; effective_from: number; committed_at: number; status: string; commit_tx: string | null }>();
  return results.map((row) => ({
    hash: row.hash,
    json: row.json,
    effectiveFrom: row.effective_from,
    committedAt: row.committed_at,
    status: row.status as "pending" | "confirmed" | "failed",
    commitTx: row.commit_tx,
  }));
}

export async function lastFetchAt(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT MAX(fetched_at) AS at FROM tweets").first<{ at: number | null }>();
  return row?.at ?? null;
}

export async function tradeCounts(db: D1Database) {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n, MAX(is_demo) AS demo FROM trades GROUP BY status")
    .all<{ status: TradeRow["status"]; n: number; demo: number }>();
  const counts = { submitted: 0, stamped: 0, failed: 0 };
  let demo = false;
  for (const row of results) {
    counts[row.status] = row.n;
    demo ||= row.demo === 1;
  }
  return { counts, demo };
}

export type FeedPost = TweetFields & { postedAt: number; extraction: Extraction | null };

export async function feedPosts(db: D1Database, promptHash: string, fromMs: number, toMs: number): Promise<FeedPost[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.author, t.text, t.created_at, t.posted_at, e.json FROM tweets t
       LEFT JOIN extractions e ON e.tweet_id = t.id AND e.prompt_hash = ?
       WHERE t.posted_at >= ? AND t.posted_at <= ? ORDER BY t.posted_at DESC, t.id DESC`,
    )
    .bind(promptHash, fromMs, toMs)
    .all<TweetRow & { posted_at: number; json: string | null }>();
  return results.map((row) => ({
    ...toTweet(row),
    postedAt: row.posted_at,
    extraction: row.json ? (JSON.parse(row.json) as Extraction) : null,
  }));
}

// A conditional update makes repeated exit checks idempotent.
export async function closeTrade(db: D1Database, id: number, exit: {
  priceE8: string; priceAt: number; closedAt: number; reason: "stop-loss" | "take-profit";
}): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE trades SET closed_at = ?, exit_price_e8 = ?, exit_price_at = ?, exit_reason = ? WHERE id = ? AND status = 'stamped' AND closed_at IS NULL AND is_demo = 0",
  ).bind(exit.closedAt, exit.priceE8, exit.priceAt, exit.reason, id).run();
  return result.meta.changes === 1;
}

// Closing frees the slot, but the same set of posts must not reopen it each tick.
export async function previouslyTradedSignal(db: D1Database, token: string, side: Side, tweetIds: string[]): Promise<boolean> {
  const { results } = await db.prepare(
    "SELECT request_json FROM trades WHERE token = ? AND side = ? AND status = 'stamped' AND closed_at IS NOT NULL AND is_demo = 0",
  ).bind(token, side).all<{ request_json: string }>();
  return results.some((row) => {
    const previous = new Set((JSON.parse(row.request_json) as { tweetIds: string[] }).tweetIds);
    return tweetIds.every((id) => previous.has(id));
  });
}
