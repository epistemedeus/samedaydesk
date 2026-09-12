-- Isolated local outbox for job-result callbacks. Non-settling prototype.
-- Not a payment ledger. sold/sale/buyer_accepted stay false.

CREATE TABLE IF NOT EXISTS job_delivery_outbox_events (
  event_id TEXT PRIMARY KEY,
  body_hash TEXT NOT NULL CHECK (char_length(body_hash) = 64),
  terms_hash TEXT NOT NULL CHECK (char_length(terms_hash) = 64),
  terms_version INTEGER NOT NULL CHECK (terms_version >= 1),
  delivery_state TEXT NOT NULL CHECK (delivery_state IN ('queued', 'unknown', 'failed', 'delivered')),
  sample BOOLEAN NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT FALSE CHECK (sold = FALSE),
  buyer_accepted BOOLEAN NOT NULL DEFAULT FALSE CHECK (buyer_accepted = FALSE),
  sale BOOLEAN NOT NULL DEFAULT FALSE CHECK (sale = FALSE),
  callback_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  callback_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS job_delivery_outbox_attempts (
  attempt_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES job_delivery_outbox_events(event_id),
  recorded_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  outcome TEXT NOT NULL CHECK (outcome IN ('unknown', 'failed', 'delivered')),
  http_status INTEGER,
  ack JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS job_delivery_outbox_attempts_event_idx
  ON job_delivery_outbox_attempts (event_id, recorded_at);
