-- S275 earned-work kernel (prototype).
-- Fixture/test provenance is an explicit row field (provenance IN test|fixture|production).
-- No payment rails, transfer tables, settlement workers, or artifact execution.
-- evidence_bytes are authenticated received bytes (never fetched from artifact.ref, never executed here).

CREATE TABLE IF NOT EXISTS earned_work_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) <= 120),
  summary TEXT NOT NULL CHECK (char_length(summary) <= 2000),
  provenance TEXT NOT NULL CHECK (provenance IN ('test', 'fixture', 'production')),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN (
    'open', 'claimed', 'submitted', 'verified', 'accepted', 'rejected'
  )),
      funding_state TEXT NOT NULL CHECK (funding_state IN ('unfunded', 'reserved', 'released')),
  payout_state TEXT NOT NULL CHECK (payout_state IN (
    'none', 'owed', 'queued', 'submitted', 'confirmed', 'failed', 'unknown'
  )),
  current_terms_version TEXT NOT NULL CHECK (current_terms_version ~ '^sha256:[0-9a-f]{64}$'),
  terms_revision INTEGER NOT NULL CHECK (terms_revision >= 1),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  correction_max_revisions INTEGER NOT NULL CHECK (correction_max_revisions >= 0 AND correction_max_revisions <= 1),
  budget_amount TEXT NOT NULL,
  budget_asset TEXT NOT NULL CHECK (char_length(budget_asset) <= 32),
  budget_network TEXT NOT NULL CHECK (char_length(budget_network) <= 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS earned_work_terms (
  task_id TEXT NOT NULL REFERENCES earned_work_tasks(id) ON DELETE CASCADE,
  version TEXT NOT NULL CHECK (version ~ '^sha256:[0-9a-f]{64}$'),
  terms_revision INTEGER NOT NULL CHECK (terms_revision >= 1),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  summary TEXT NOT NULL CHECK (char_length(summary) <= 2000),
  reward_amount TEXT NOT NULL,
  reward_asset TEXT NOT NULL CHECK (char_length(reward_asset) <= 32),
  reward_network TEXT NOT NULL CHECK (char_length(reward_network) <= 64),
  claim_ttl_seconds INTEGER NOT NULL CHECK (claim_ttl_seconds >= 1 AND claim_ttl_seconds <= 86400),
  max_artifact_bytes INTEGER NOT NULL CHECK (max_artifact_bytes >= 1 AND max_artifact_bytes <= 1000000),
  allowed_media_types TEXT[] NOT NULL,
  slot_limit INTEGER NOT NULL CHECK (slot_limit >= 1 AND slot_limit <= 16),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (task_id, version)
);

CREATE TABLE IF NOT EXISTS earned_work_contributor_tokens (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL CHECK (char_length(public_id) <= 120),
  token_hash TEXT NOT NULL UNIQUE,
  payout_destination TEXT CHECK (payout_destination IS NULL OR char_length(payout_destination) <= 200),
  task_scope TEXT CHECK (task_scope IS NULL OR char_length(task_scope) <= 128),
  provenance TEXT NOT NULL CHECK (provenance IN ('test', 'fixture', 'production')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS earned_work_contributor_tokens_public_idx
  ON earned_work_contributor_tokens (public_id);

-- Occupying reservations: status IN ('active','submitted').
-- Unique active reservation per task/version/credential (public_id is a label, not principal).
CREATE TABLE IF NOT EXISTS earned_work_reservations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES earned_work_tasks(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  contributor_public_id TEXT NOT NULL CHECK (char_length(contributor_public_id) <= 120),
  contributor_token_id TEXT NOT NULL REFERENCES earned_work_contributor_tokens(id),
  status TEXT NOT NULL CHECK (status IN (
    'active', 'submitted', 'expired', 'released', 'completed'
  )),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (task_id, terms_version) REFERENCES earned_work_terms(task_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS earned_work_reservations_active_contributor
  ON earned_work_reservations (task_id, terms_version, contributor_token_id)
  WHERE status IN ('active', 'submitted');

CREATE INDEX IF NOT EXISTS earned_work_reservations_task_status_idx
  ON earned_work_reservations (task_id, status);

CREATE TABLE IF NOT EXISTS earned_work_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES earned_work_tasks(id) ON DELETE CASCADE,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES earned_work_reservations(id),
  terms_version TEXT NOT NULL,
  artifact_ref TEXT NOT NULL CHECK (char_length(artifact_ref) <= 2048),
  artifact_digest_sha256 TEXT NOT NULL CHECK (char_length(artifact_digest_sha256) = 64),
  artifact_media_type TEXT NOT NULL CHECK (char_length(artifact_media_type) <= 200),
  artifact_bytes INTEGER NOT NULL CHECK (artifact_bytes >= 1),
  evidence_bytes BYTEA CONSTRAINT earned_work_submissions_evidence_bytes_check CHECK (
    evidence_bytes IS NULL OR (
      octet_length(evidence_bytes) >= 1
      AND octet_length(evidence_bytes) <= 16384
      AND octet_length(evidence_bytes) = artifact_bytes
    )
  ),
  created_at TIMESTAMPTZ NOT NULL
);

-- Append-only verdicts. Accept binds an explicit verdict id; newest created_at is not authority.
CREATE TABLE IF NOT EXISTS earned_work_verdicts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES earned_work_tasks(id) ON DELETE CASCADE,
  reservation_id TEXT NOT NULL REFERENCES earned_work_reservations(id),
  submission_id TEXT NOT NULL REFERENCES earned_work_submissions(id),
  terms_version TEXT NOT NULL,
  artifact_digest_sha256 TEXT NOT NULL CHECK (char_length(artifact_digest_sha256) = 64),
  verifier_version TEXT NOT NULL CHECK (char_length(verifier_version) <= 120),
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'needs_review')),
  reasons JSONB NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (reservation_id, ordinal)
);

CREATE INDEX IF NOT EXISTS earned_work_verdicts_reservation_ordinal_idx
  ON earned_work_verdicts (reservation_id, ordinal);

-- Typed owed records only. No transfer implementation, no chain tx columns.
CREATE TABLE IF NOT EXISTS earned_work_obligations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES earned_work_tasks(id) ON DELETE CASCADE,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES earned_work_reservations(id),
  submission_id TEXT NOT NULL REFERENCES earned_work_submissions(id),
  contributor_public_id TEXT NOT NULL,
  payout_destination TEXT CHECK (payout_destination IS NULL OR char_length(payout_destination) <= 200),
  reward_amount TEXT NOT NULL,
  reward_asset TEXT NOT NULL,
  reward_network TEXT NOT NULL,
  payout_state TEXT NOT NULL CHECK (payout_state = 'owed'),
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^sha256:[0-9a-f]{64}$'),
  idempotency_key TEXT NOT NULL,
  adapter TEXT NOT NULL,
  verdict_id TEXT NOT NULL UNIQUE REFERENCES earned_work_verdicts(id),
  created_at TIMESTAMPTZ NOT NULL
);

-- Compact append-only log: discovery → claim → submit → accept → pay → repeat
-- plus verdict/reject/terms/funding_reserve for the HTTP surface.
CREATE TABLE IF NOT EXISTS earned_work_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES earned_work_tasks(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'discovery', 'claim', 'submit', 'verdict', 'accept', 'pay', 'repeat',
    'reject', 'terms', 'funding_reserve'
  )),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (task_id, sequence)
);

CREATE INDEX IF NOT EXISTS earned_work_events_task_sequence_idx
  ON earned_work_events (task_id, sequence);

CREATE TABLE IF NOT EXISTS earned_work_idempotency (
  scope TEXT NOT NULL,
  task_id TEXT NOT NULL DEFAULT '',
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json JSONB NOT NULL,
  principal_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, task_id, key)
);

CREATE INDEX IF NOT EXISTS earned_work_idempotency_task_idx
  ON earned_work_idempotency (task_id);
