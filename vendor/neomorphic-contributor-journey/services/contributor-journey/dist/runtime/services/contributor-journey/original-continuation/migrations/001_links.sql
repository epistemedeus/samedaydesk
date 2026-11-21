CREATE TABLE IF NOT EXISTS journey_original_continuation_links (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES journey_accounts(id),
  desk_origin TEXT NOT NULL,
  canonical_origin TEXT NOT NULL,
  round_key TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('test','fixture','production')),
  claim_id TEXT NOT NULL,
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^sha256:[a-f0-9]{64}$'),
  holder_digest TEXT NOT NULL CHECK (holder_digest ~ '^[a-f0-9]{64}$'),
  consent_version TEXT NOT NULL CHECK (consent_version = 'original-continuation/v1'),
  link_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE (canonical_origin,round_key,provenance,claim_id)
);
COMMENT ON TABLE journey_original_continuation_links IS 'Consented account/source references only. No bearer, copied claim, terms document, evidence, submission or money ledger.';
CREATE TABLE IF NOT EXISTS journey_original_continuation_operations (
  link_id TEXT NOT NULL REFERENCES journey_original_continuation_links(id),
  operation_key TEXT NOT NULL,
  canonical_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK (state IN ('unknown','confirmed','refused')),
  submission_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (link_id,operation_key),
  CHECK ((state='confirmed') = (submission_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS journey_original_continuation_one_unknown ON journey_original_continuation_operations(link_id) WHERE state='unknown';
COMMENT ON TABLE journey_original_continuation_operations IS 'Transport fence and canonical references/digests, never a second delivery ledger. Unknown operations cannot be sent again.';
