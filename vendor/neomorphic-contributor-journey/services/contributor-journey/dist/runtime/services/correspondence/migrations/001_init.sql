-- Neomorphic correspondence v1
-- Explicit Postgres persistence. No email outbox tables until notifications exist.

CREATE TABLE IF NOT EXISTS correspondence_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) <= 120),
  summary TEXT NOT NULL CHECK (char_length(summary) <= 2000),
  status TEXT NOT NULL CHECK (status IN ('open', 'needs_human', 'resolved')),
  version INTEGER NOT NULL CHECK (version >= 1),
  next_action_kind TEXT CHECK (
    next_action_kind IS NULL OR next_action_kind IN ('reply', 'human_review')
  ),
  next_action_url TEXT CHECK (
    next_action_url IS NULL OR char_length(next_action_url) <= 2048
  ),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS correspondence_grants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES correspondence_projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'reader', 'writer')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS correspondence_grants_project_idx
  ON correspondence_grants (project_id);

CREATE TABLE IF NOT EXISTS correspondence_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES correspondence_projects(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'request', 'reply', 'artifact', 'correction', 'needs_human', 'resolved', 'reopened'
  )),
  text TEXT CHECK (text IS NULL OR char_length(text) <= 8000),
  artifact_url TEXT CHECK (artifact_url IS NULL OR char_length(artifact_url) <= 2048),
  artifact_label TEXT CHECK (artifact_label IS NULL OR char_length(artifact_label) <= 200),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (project_id, sequence)
);

CREATE INDEX IF NOT EXISTS correspondence_events_project_sequence_idx
  ON correspondence_events (project_id, sequence);

-- project_id is '' for administrator bootstrap idempotency rows.
CREATE TABLE IF NOT EXISTS correspondence_idempotency (
  scope TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, project_id, key)
);

CREATE INDEX IF NOT EXISTS correspondence_idempotency_project_idx
  ON correspondence_idempotency (project_id);
