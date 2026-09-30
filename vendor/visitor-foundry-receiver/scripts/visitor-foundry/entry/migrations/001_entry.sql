-- Explicitly installed in the existing correspondence namespace. No user directory.
CREATE TABLE IF NOT EXISTS correspondence_vf10_installation (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  profile JSONB NOT NULL,
  receiver_id TEXT NOT NULL,
  max_enrollments INTEGER NOT NULL CHECK(max_enrollments BETWEEN 1 AND 10000),
  charged INTEGER NOT NULL DEFAULT 0 CHECK(charged >= 0 AND charged <= max_enrollments)
);
CREATE TABLE IF NOT EXISTS correspondence_vf10_registrations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  proof_hash TEXT NOT NULL UNIQUE,
  owner_hash TEXT NOT NULL,
  project_id TEXT UNIQUE REFERENCES correspondence_projects(id),
  expires_at TIMESTAMPTZ NOT NULL,
  grant_expires_at TIMESTAMPTZ NOT NULL,
  receiver_started BOOLEAN NOT NULL DEFAULT FALSE,
  receiver_state TEXT NOT NULL DEFAULT 'disabled' CHECK(receiver_state IN ('disabled','pending','unknown','ready','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE correspondence_vf10_registrations ADD COLUMN IF NOT EXISTS receiver_started BOOLEAN NOT NULL DEFAULT FALSE;
-- Charges are never refunded by aliases, failed receiver enrollment, revocation,
-- expiry or process restart. Deleting these rows is not a supported renewal.

-- Capacity reservations only, not correspondence payloads or a second event log.
-- Commit this charge before the existing store mutation; unknown outcomes retain
-- it. Exact retries reuse the same charge and existing event idempotency record.
CREATE TABLE IF NOT EXISTS correspondence_vf10_event_reservations (
  project_id TEXT NOT NULL REFERENCES correspondence_projects(id),
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  PRIMARY KEY(project_id, request_key)
);
