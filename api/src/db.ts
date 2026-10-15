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
      'SELECT hash, json FROM rulesets WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
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

export async function extractionsSince(
  db: D1Database,
  promptHash: string,
  sinceMs: number,
): Promise<Extraction[]> {
  const { results } = await db
    .prepare(
      `SELECT e.json FROM extractions e JOIN tweets t ON t.id = e.tweet_id
       WHERE e.prompt_hash = ? AND t.posted_at >= ? ORDER BY t.posted_at, t.id`,
    )
    .bind(promptHash, sinceMs)
    .all<{ json: string }>()
  return results.map((row) => JSON.parse(row.json) as Extraction)
}

export type NewTrade = {
  rulesetHash: string
  token: string
  side: Side
  requestJson: string
  signalJson: string
  submittedAt: number
}

export async function insertSubmittedTrade(
  db: D1Database,
  trade: NewTrade,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO trades (ruleset_hash, token, side, request_json, signal_json, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, 'submitted', ?) RETURNING id`,
    )
    .bind(
      trade.rulesetHash,
      trade.token,
      trade.side,
      trade.requestJson,
      trade.signalJson,
      trade.submittedAt,
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
      "SELECT token FROM trades WHERE status IN ('submitted', 'stamped') AND closed_at IS NULL ORDER BY id",
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

export async function markFailed(db: D1Database, id: number) {
  await db
    .prepare("UPDATE trades SET status = 'failed' WHERE id = ?")
    .bind(id)
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
