-- A ruleset submitted from the app is pending until its RulesetCommitted event is
-- seen on-chain; only confirmed rulesets can be in force. Earlier rows were
-- committed by script and are already on-chain.
ALTER TABLE rulesets ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'failed'));
ALTER TABLE rulesets ADD COLUMN commit_tx TEXT;
