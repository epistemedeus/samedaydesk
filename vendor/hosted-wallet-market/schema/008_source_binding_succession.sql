-- Additive joint package/host identity. Legacy enrollment, edges and consent
-- remain immutable. Runtime anchors the validated complete legacy chain under
-- the original owner's authenticated enroll transaction. No backfill guessing.
CREATE TABLE IF NOT EXISTS hosted_wallet_market.source_binding_anchor (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  legacy_chain_sha256 TEXT NOT NULL CHECK (legacy_chain_sha256 ~ '^[0-9a-f]{64}$'),
  legacy_edge_count INTEGER NOT NULL CHECK (legacy_edge_count BETWEEN 0 AND 64),
  preservation_sha256 TEXT NOT NULL CHECK (preservation_sha256 ~ '^[0-9a-f]{64}$'),
  principal_id TEXT NOT NULL CHECK (principal_id ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS hosted_wallet_market.source_binding_succession (
  predecessor_source_sha256 TEXT NOT NULL CHECK (predecessor_source_sha256 ~ '^[0-9a-f]{64}$'),
  predecessor_host_source_sha256 TEXT NOT NULL CHECK (predecessor_host_source_sha256 ~ '^[0-9a-f]{64}$'),
  successor_source_sha256 TEXT NOT NULL CHECK (successor_source_sha256 ~ '^[0-9a-f]{64}$'),
  successor_host_source_sha256 TEXT NOT NULL CHECK (successor_host_source_sha256 ~ '^[0-9a-f]{64}$'),
  consumer_contract_sha256 TEXT NOT NULL CHECK (consumer_contract_sha256 ~ '^[0-9a-f]{64}$'),
  preservation_sha256 TEXT NOT NULL CHECK (preservation_sha256 ~ '^[0-9a-f]{64}$'),
  principal_id TEXT NOT NULL CHECK (principal_id ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (predecessor_source_sha256, predecessor_host_source_sha256),
  UNIQUE (successor_source_sha256, successor_host_source_sha256),
  CHECK ((predecessor_source_sha256, predecessor_host_source_sha256) <>
         (successor_source_sha256, successor_host_source_sha256))
);
DROP TRIGGER IF EXISTS source_binding_anchor_preserve ON hosted_wallet_market.source_binding_anchor;
CREATE TRIGGER source_binding_anchor_preserve BEFORE UPDATE OR DELETE ON hosted_wallet_market.source_binding_anchor
  FOR EACH ROW EXECUTE FUNCTION hosted_wallet_market.reject_succession_mutation();
DROP TRIGGER IF EXISTS source_binding_succession_preserve ON hosted_wallet_market.source_binding_succession;
CREATE TRIGGER source_binding_succession_preserve BEFORE UPDATE OR DELETE ON hosted_wallet_market.source_binding_succession
  FOR EACH ROW EXECUTE FUNCTION hosted_wallet_market.reject_succession_mutation();
