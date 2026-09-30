-- Receiver-owned aggregate allocation; canonical pools/attempts retain execution authority.
CREATE TABLE IF NOT EXISTS correspondence_vf12_host (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 config jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS correspondence_vf12_admissions (
 registration_id text PRIMARY KEY REFERENCES correspondence_vf10_registrations(id),
 project_id text UNIQUE NOT NULL REFERENCES correspondence_projects(id),
 binding jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','ready','declined')),
 charged boolean NOT NULL,
 reason text,
 pool_config_digest text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- No down migration: uninstalling a route never resets charged registrations,
-- reserved host allowances, unknown physical work, or existing receiver history.
