-- Deployment identity and canonical references only. No accounts, rounds or IOUs are imported.
CREATE TABLE IF NOT EXISTS journey_deployment (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
 profile TEXT NOT NULL CHECK (profile IN ('staging','live')),
 binding_sha256 TEXT NOT NULL CHECK (binding_sha256 ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE journey_task_links ADD COLUMN IF NOT EXISTS opportunity_round_id TEXT REFERENCES opportunity_rounds(id);
ALTER TABLE journey_task_links ADD COLUMN IF NOT EXISTS opportunity_offer_id TEXT REFERENCES opportunity_offers(id);
ALTER TABLE journey_task_links ADD COLUMN IF NOT EXISTS terms_version TEXT;
