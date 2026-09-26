-- Apply after correspondence 001_init.sql in the SAME validated search_path.
-- No bearer, payment, execution hook, outbox or second journal.
CREATE TABLE IF NOT EXISTS correspondence_vf02_work_cells (
  project_id TEXT NOT NULL REFERENCES correspondence_projects(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  gap_id TEXT NOT NULL,
  work_scope TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  state JSONB,
  PRIMARY KEY (project_id, id),
  UNIQUE (project_id, gap_id, work_scope),
  CHECK (state IS NULL OR (
    state->>'id' = id AND state->>'projectId' = project_id
    AND (state->>'revision')::integer = revision
  ))
);

-- Existing durable idempotency receipts are the replay source. Per-cell prefix
-- and revision index keep scans local; no correspondence project/event lock.
CREATE UNIQUE INDEX IF NOT EXISTS correspondence_vf02_receipt_revision_idx
  ON correspondence_idempotency (project_id, scope, ((response_json->>'revision')::integer))
  WHERE scope LIKE 'vf02:cell:%';
