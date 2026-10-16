CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  source TEXT NOT NULL CHECK (source IN ('daily', 'manual')),
  created_at INTEGER NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  CHECK (period_start < period_end)
);
CREATE UNIQUE INDEX reports_daily_period ON reports (period_start) WHERE source = 'daily';
CREATE INDEX reports_created_at ON reports (created_at DESC, id DESC);

-- Preserve the first reporting day even if generation fails across midnight.
CREATE TABLE report_schedule (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_day INTEGER NOT NULL
);
