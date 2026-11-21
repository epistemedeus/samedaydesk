-- Publication only. No edits, cascades or foreign-key deletes into earned obligations or old rounds.
BEGIN;
CREATE TABLE IF NOT EXISTS contributor_showcase_consents (
  work_id TEXT PRIMARY KEY CHECK (char_length(work_id) BETWEEN 12 AND 96),
  account_id TEXT NOT NULL CHECK (char_length(account_id) BETWEEN 1 AND 160),
  record JSONB NOT NULL CHECK (jsonb_typeof(record) = 'object')
);
CREATE TABLE IF NOT EXISTS contributor_showcase_operations (
  account_id TEXT NOT NULL CHECK (char_length(account_id) BETWEEN 1 AND 160),
  work_id TEXT NOT NULL REFERENCES contributor_showcase_consents(work_id),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 160),
  operation JSONB NOT NULL CHECK (jsonb_typeof(operation) = 'object'),
  PRIMARY KEY (account_id, work_id, idempotency_key)
);
ALTER TABLE contributor_showcase_consents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE contributor_showcase_operations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS contributor_showcase_visible_idx ON contributor_showcase_consents (work_id)
  WHERE record->>'visibility' = 'visible';
COMMIT;
