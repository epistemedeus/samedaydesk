-- HA1 durable retrieval metadata. Admission identities are never deleted.
-- Artifact bytes live in a private service directory; this table is not a job state machine.

CREATE TABLE IF NOT EXISTS managed_useful_jobs_acquisitions (
  execution_id TEXT PRIMARY KEY CHECK (char_length(execution_id) BETWEEN 1 AND 128),
  principal_id TEXT NOT NULL CHECK (char_length(principal_id) BETWEEN 1 AND 256),
  request_hash TEXT NOT NULL CHECK (char_length(request_hash) = 64),
  request_hash_algorithm TEXT NOT NULL,
  request_hash_version TEXT NOT NULL,
  managed_order_terms_hash TEXT CHECK (managed_order_terms_hash IS NULL OR char_length(managed_order_terms_hash) = 64),
  managed_order_terms_schema TEXT,
  hashes_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  job_id TEXT NOT NULL CHECK (job_id IN ('lockfile-pin-delta', 'vendor-budget-impact')),
  terms_version TEXT NOT NULL,
  sample BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_sha256 TEXT CHECK (receipt_sha256 IS NULL OR char_length(receipt_sha256) = 64),
  outputs_digest TEXT CHECK (outputs_digest IS NULL OR char_length(outputs_digest) = 64),
  outputs_json JSONB,
  state TEXT NOT NULL CHECK (state IN ('pending', 'available', 'expired', 'identity-conflict', 'integrity-failed')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  purchase_authority BOOLEAN NOT NULL DEFAULT FALSE CHECK (purchase_authority = FALSE),
  sold BOOLEAN NOT NULL DEFAULT FALSE CHECK (sold = FALSE),
  bytes_purged BOOLEAN NOT NULL DEFAULT FALSE,
  order_id TEXT,
  metadata_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS managed_useful_jobs_acquisitions_principal
  ON managed_useful_jobs_acquisitions (principal_id, execution_id);
