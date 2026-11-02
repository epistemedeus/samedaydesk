-- One explicit capability choice per account. Absence means the unfunded default.
-- This is not a balance, obligation, settlement, nonce, or budget journal.
CREATE TABLE IF NOT EXISTS hosted_wallet_market.capability_selection (
  account_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.journey_accounts(id),
  tenant TEXT NOT NULL CHECK (tenant ~ '^[a-z][a-z0-9_-]{2,63}$'),
  capability TEXT NOT NULL CHECK (capability IN ('unfunded', 'qualified')),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  host_sha256 TEXT NOT NULL CHECK (host_sha256 ~ '^[0-9a-f]{64}$'),
  operation_id TEXT NOT NULL UNIQUE CHECK (char_length(operation_id) BETWEEN 8 AND 160),
  selected_at TIMESTAMPTZ NOT NULL
);

-- Predecessor voluntary terms stay immutable. The row records a succession
-- edge the consumer already holds; it does not rewrite terms or hashes.
CREATE TABLE IF NOT EXISTS hosted_wallet_market.voluntary_predecessor_binding (
  tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^[a-z][a-z0-9_-]{2,63}$'),
  task_id TEXT NOT NULL,
  terms_digest TEXT NOT NULL CHECK (terms_digest ~ '^[0-9a-f]{64}$'),
  predecessor_source_sha256 TEXT NOT NULL CHECK (predecessor_source_sha256 ~ '^[0-9a-f]{64}$'),
  predecessor_host_sha256 TEXT NOT NULL CHECK (predecessor_host_sha256 ~ '^[0-9a-f]{64}$'),
  successor_source_sha256 TEXT NOT NULL CHECK (successor_source_sha256 ~ '^[0-9a-f]{64}$'),
  successor_host_sha256 TEXT NOT NULL CHECK (successor_host_sha256 ~ '^[0-9a-f]{64}$'),
  succession_graph_sha256 TEXT NOT NULL CHECK (succession_graph_sha256 ~ '^[0-9a-f]{64}$'),
  operation_id TEXT NOT NULL CHECK (char_length(operation_id) BETWEEN 8 AND 160),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, task_id, terms_digest),
  CHECK ((predecessor_source_sha256, predecessor_host_sha256) <>
         (successor_source_sha256, successor_host_sha256))
);

DROP TRIGGER IF EXISTS voluntary_predecessor_binding_preserve ON hosted_wallet_market.voluntary_predecessor_binding;
CREATE TRIGGER voluntary_predecessor_binding_preserve
  BEFORE UPDATE OR DELETE ON hosted_wallet_market.voluntary_predecessor_binding
  FOR EACH ROW
  EXECUTE FUNCTION hosted_wallet_market.reject_succession_mutation();
