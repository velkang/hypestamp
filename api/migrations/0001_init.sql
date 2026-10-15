-- Rulesets committed on-chain; json is the canonical source whose keccak256 is hash.
CREATE TABLE rulesets (
  hash TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  effective_from INTEGER NOT NULL, -- unix seconds
  committed_at INTEGER NOT NULL
);

CREATE TABLE tweets (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL, -- raw twitterapi.io string, part of tweetHash
  posted_at INTEGER NOT NULL, -- epoch ms
  fetched_at INTEGER NOT NULL
);
CREATE INDEX tweets_posted_at ON tweets (posted_at);

-- Keyed by prompt hash: a new committed prompt re-extracts.
CREATE TABLE extractions (
  tweet_id TEXT NOT NULL REFERENCES tweets (id),
  prompt_hash TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (tweet_id, prompt_hash)
);

-- A paper trade from submission to on-chain stamp. request_json is the exact
-- StampRequest sent to CRE; bundle_hash is filled in by ledger reconciliation.
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_hash TEXT NOT NULL REFERENCES rulesets (hash),
  token TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  request_json TEXT NOT NULL,
  signal_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'stamped', 'failed')),
  bundle_hash TEXT UNIQUE,
  entry_price_e8 TEXT,
  tx_hash TEXT,
  submitted_at INTEGER NOT NULL,
  stamped_at INTEGER,
  closed_at INTEGER
);
CREATE INDEX trades_status ON trades (status);

CREATE TABLE ledger_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_block INTEGER NOT NULL
);
