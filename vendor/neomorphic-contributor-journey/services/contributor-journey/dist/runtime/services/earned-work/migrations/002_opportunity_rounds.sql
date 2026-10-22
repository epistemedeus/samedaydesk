-- Opportunity rounds (prototype). Integer atomic budget. No payment rails.
-- Artifact refs are metadata and are never fetched or executed.
-- Fixture and test provenance are not production credential grants.
-- A waitlist row is not a paid slot. An owed row is not a transfer.

CREATE TABLE IF NOT EXISTS opportunity_rounds (
  id TEXT PRIMARY KEY,
  round_key TEXT NOT NULL CHECK (char_length(round_key) <= 80),
  provenance TEXT NOT NULL CHECK (provenance IN ('test', 'fixture', 'production')),
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  production_admission BOOLEAN NOT NULL DEFAULT FALSE,
  principal_cap_atomic BIGINT NOT NULL CHECK (principal_cap_atomic >= 0),
  atomic_scale INTEGER NOT NULL CHECK (atomic_scale >= 0 AND atomic_scale <= 18),
  asset TEXT NOT NULL CHECK (char_length(asset) <= 32),
  network TEXT NOT NULL CHECK (char_length(network) <= 64),
  chain_id INTEGER NOT NULL CHECK (chain_id >= 1),
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^sha256:[0-9a-f]{64}$'),
  terms_document JSONB NOT NULL,
  submission_deadline TIMESTAMPTZ NOT NULL,
  claim_ttl_seconds INTEGER NOT NULL CHECK (claim_ttl_seconds >= 1 AND claim_ttl_seconds <= 1209600),
  review_within_days INTEGER NOT NULL CHECK (review_within_days >= 0 AND review_within_days <= 30),
  max_clarifications INTEGER NOT NULL CHECK (max_clarifications >= 0 AND max_clarifications <= 1),
  max_evidence_bytes INTEGER NOT NULL CHECK (max_evidence_bytes >= 1 AND max_evidence_bytes <= 16384),
  transfer_fee_cap JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (provenance <> 'production' OR production_admission = TRUE),
  CHECK (provenance = 'production' OR production_admission = FALSE),
  UNIQUE (round_key, provenance)
);

CREATE TABLE IF NOT EXISTS opportunity_offers (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  offer_key TEXT NOT NULL CHECK (char_length(offer_key) <= 80),
  title TEXT NOT NULL CHECK (char_length(title) <= 160),
  summary TEXT NOT NULL CHECK (char_length(summary) <= 4000),
  slot_count INTEGER NOT NULL CHECK (slot_count >= 0 AND slot_count <= 10000),
  reward_atomic BIGINT NOT NULL CHECK (reward_atomic >= 0),
  max_effort_seconds INTEGER NOT NULL CHECK (max_effort_seconds >= 1 AND max_effort_seconds <= 86400),
  acceptance TEXT NOT NULL CHECK (char_length(acceptance) <= 2000),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('discovery_trace', 'workflow_witness')),
  public_claimable BOOLEAN NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 0 AND rank <= 1000),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (round_id, offer_key)
);

CREATE TABLE IF NOT EXISTS opportunity_alternatives (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  rank INTEGER NOT NULL CHECK (rank >= 0 AND rank <= 1000),
  alternative_key TEXT NOT NULL CHECK (char_length(alternative_key) <= 80),
  title TEXT NOT NULL CHECK (char_length(title) <= 160),
  summary TEXT NOT NULL CHECK (char_length(summary) <= 2000),
  funded BOOLEAN NOT NULL CHECK (funded = FALSE),
  paid_slot BOOLEAN NOT NULL CHECK (paid_slot = FALSE),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (round_id, alternative_key)
);

-- Occupying statuses consume the round cap. expired and released do not.
-- accepted and owed are occupying and are not releasable by expiry.
CREATE TABLE IF NOT EXISTS opportunity_claims (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  offer_id TEXT NOT NULL REFERENCES opportunity_offers(id),
  kind TEXT NOT NULL CHECK (kind IN ('imported_personal', 'owner_assigned', 'public_claim')),
  status TEXT NOT NULL CHECK (status IN (
    'reserved', 'submitted', 'accepted', 'owed', 'released', 'expired'
  )),
  public_label TEXT NOT NULL CHECK (char_length(public_label) <= 80),
  credential_ref TEXT NOT NULL CHECK (char_length(credential_ref) <= 128),
  contributor_token_id TEXT NOT NULL REFERENCES earned_work_contributor_tokens(id),
  import_key TEXT CHECK (import_key IS NULL OR char_length(import_key) <= 160),
  settlement_key TEXT NOT NULL UNIQUE,
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^sha256:[0-9a-f]{64}$'),
  reward_atomic BIGINT NOT NULL CHECK (reward_atomic >= 0),
  defer_start BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  assigned_scope JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_claims_occupying_credential
  ON opportunity_claims (round_id, offer_id, credential_ref)
  WHERE status IN ('reserved', 'submitted', 'accepted', 'owed');

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_claims_import_key
  ON opportunity_claims (round_id, import_key)
  WHERE import_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS opportunity_claims_offer_status_idx
  ON opportunity_claims (offer_id, status);

CREATE TABLE IF NOT EXISTS opportunity_submissions (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES opportunity_claims(id),
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  terms_version TEXT NOT NULL,
  evidence JSONB NOT NULL,
  evidence_bytes INTEGER NOT NULL CHECK (evidence_bytes >= 1 AND evidence_bytes <= 16384),
  artifact_ref TEXT NOT NULL CHECK (char_length(artifact_ref) <= 2048),
  artifact_digest_sha256 TEXT NOT NULL CHECK (char_length(artifact_digest_sha256) = 64),
  artifact_media_type TEXT NOT NULL CHECK (char_length(artifact_media_type) <= 200),
  artifact_bytes INTEGER NOT NULL CHECK (artifact_bytes >= 1),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_obligations (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES opportunity_claims(id),
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  settlement_key TEXT NOT NULL UNIQUE,
  reward_atomic BIGINT NOT NULL CHECK (reward_atomic >= 0),
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  terms_version TEXT NOT NULL,
  payout_state TEXT NOT NULL CHECK (payout_state = 'owed'),
  adapter TEXT NOT NULL CHECK (adapter = 'null_nonpaying_v0'),
  kind TEXT NOT NULL CHECK (kind = 'owed_record'),
  transfer JSONB CHECK (transfer IS NULL),
  paid BOOLEAN NOT NULL CHECK (paid = FALSE),
  settled BOOLEAN NOT NULL CHECK (settled = FALSE),
  revenue BOOLEAN NOT NULL CHECK (revenue = FALSE),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_source_records (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  claim_id TEXT REFERENCES opportunity_claims(id),
  self_report JSONB NOT NULL,
  observed JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_events (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  claim_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN (
    'encounter', 'listing', 'claim', 'submission', 'acceptance', 'owed',
    'paid_observation', 'useful_reuse', 'repeat', 'import', 'waitlist', 'notice'
  )),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS opportunity_events_round_idx
  ON opportunity_events (round_id, created_at);

CREATE TABLE IF NOT EXISTS opportunity_waitlist (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  credential_ref TEXT NOT NULL CHECK (char_length(credential_ref) <= 128),
  public_label TEXT NOT NULL CHECK (char_length(public_label) <= 80),
  reason TEXT NOT NULL CHECK (char_length(reason) <= 80),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (round_id, credential_ref)
);

CREATE TABLE IF NOT EXISTS opportunity_cohort_events (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES opportunity_rounds(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'contacted', 'delivered', 'replied', 'claimed', 'completed',
    'accepted', 'paid', 'useful_later_consumer'
  )),
  event_ref TEXT NOT NULL CHECK (char_length(event_ref) <= 160),
  public_label TEXT CHECK (public_label IS NULL OR char_length(public_label) <= 80),
  active_minutes INTEGER CHECK (active_minutes IS NULL OR (active_minutes >= 0 AND active_minutes <= 100000)),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (round_id, kind, event_ref)
);

-- Closed notices preserve the prior promise. Closing does not reprice it.
CREATE TABLE IF NOT EXISTS opportunity_notices (
  id TEXT PRIMARY KEY,
  campaign_key TEXT NOT NULL UNIQUE CHECK (char_length(campaign_key) <= 80),
  status TEXT NOT NULL CHECK (status IN ('closed')),
  preserved_promise JSONB NOT NULL,
  next_round_key TEXT CHECK (next_round_key IS NULL OR char_length(next_round_key) <= 80),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
