-- Isolated local order binding for W5-D04. Not an earned-work kernel or money ledger.
-- Terms hash is order-terms identity; D01 receipt hashes are a different document.

CREATE TABLE IF NOT EXISTS managed_useful_jobs_orders (
  order_id TEXT PRIMARY KEY CHECK (char_length(order_id) BETWEEN 1 AND 128),
  terms_hash TEXT NOT NULL CHECK (char_length(terms_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'complete')),
  holder_pid INTEGER,
  holder_token TEXT,
  execution_count INTEGER NOT NULL DEFAULT 0,
  engine_id TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL CHECK (char_length(archive_sha256) = 64),
  request_json JSONB NOT NULL,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS managed_useful_jobs_executions (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  holder_pid INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
