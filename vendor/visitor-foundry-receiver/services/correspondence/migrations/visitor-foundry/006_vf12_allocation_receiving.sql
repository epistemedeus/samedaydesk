-- Explicit private pre-admission transition only. No UPDATE of enrolled authority
-- on migration/startup; full old records remain here after a successful receive.
CREATE TABLE IF NOT EXISTS correspondence_vf12_allocation_receipts (
 id text PRIMARY KEY,
 record jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
