-- Risk inputs are bound to new stamp requests; older trades have no snapshot.
ALTER TABLE trades ADD COLUMN open_tokens_json TEXT;
ALTER TABLE trades ADD COLUMN failure_reason TEXT CHECK (failure_reason IN ('submission-failed', 'stamp-timeout'));
ALTER TABLE trades ADD COLUMN exit_price_e8 TEXT;
ALTER TABLE trades ADD COLUMN exit_price_at INTEGER;
ALTER TABLE trades ADD COLUMN exit_reason TEXT CHECK (exit_reason IN ('stop-loss', 'take-profit'));
