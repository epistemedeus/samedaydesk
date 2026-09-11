-- Isolated local order binding for W4-commerce-20.
-- Not an earned-work kernel, payment ledger, or live catalog.

CREATE TABLE IF NOT EXISTS managed_useful_jobs_orders (
  order_id TEXT PRIMARY KEY CHECK (char_length(order_id) BETWEEN 1 AND 128),
  terms_hash TEXT NOT NULL CHECK (char_length(terms_hash) = 64),
  engine_id TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL CHECK (char_length(archive_sha256) = 64),
  request_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
