-- Marks seeded illustrative trades so the UI can label them; live trades stay 0.
ALTER TABLE trades ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
