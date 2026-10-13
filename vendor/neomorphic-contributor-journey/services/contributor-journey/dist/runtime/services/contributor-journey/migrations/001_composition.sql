-- Composition-owned references and privacy state, not a new task/message/payment engine.
CREATE TABLE IF NOT EXISTS journey_task_links (
 task_id TEXT PRIMARY KEY, round_key TEXT NOT NULL, requester_account_id TEXT NOT NULL REFERENCES journey_accounts(id),
 discussion_project_id TEXT NOT NULL UNIQUE, public_discussion BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS journey_review_links (
 source_hash TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('clarification','decision')),
 project_id TEXT NOT NULL UNIQUE, PRIMARY KEY(source_hash,kind)
);
CREATE TABLE IF NOT EXISTS journey_work_links (
 work_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES journey_task_links(task_id),
 reservation_id TEXT NOT NULL UNIQUE REFERENCES opportunity_claims(id), account_id TEXT NOT NULL REFERENCES journey_accounts(id)
);
CREATE TABLE IF NOT EXISTS journey_approved_summaries (
 work_id TEXT PRIMARY KEY REFERENCES journey_work_links(work_id), record JSONB NOT NULL, request_hash TEXT NOT NULL,
 requester_account_id TEXT NOT NULL REFERENCES journey_accounts(id)
);
CREATE TABLE IF NOT EXISTS journey_profile_publications (
 profile_id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE REFERENCES journey_accounts(id),
 record JSONB NOT NULL CHECK(jsonb_typeof(record)='object')
);
CREATE TABLE IF NOT EXISTS journey_profile_operations (
 account_id TEXT NOT NULL REFERENCES journey_accounts(id), operation_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 result_version INTEGER NOT NULL, PRIMARY KEY(account_id,operation_key)
);
CREATE TABLE IF NOT EXISTS journey_referral_shares (
 share_ref TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES journey_accounts(id), record JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS journey_referral_operations (
 account_id TEXT NOT NULL REFERENCES journey_accounts(id), operation_key TEXT NOT NULL, body_digest TEXT NOT NULL,
 share_ref TEXT NOT NULL REFERENCES journey_referral_shares(share_ref), record JSONB NOT NULL, PRIMARY KEY(account_id,operation_key)
);
CREATE TABLE IF NOT EXISTS journey_source_events (
 event_id TEXT PRIMARY KEY, body_digest TEXT NOT NULL, record JSONB NOT NULL CHECK(jsonb_typeof(record)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE journey_source_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE IF NOT EXISTS journey_visitors (
 visitor_ref TEXT PRIMARY KEY, account_id TEXT REFERENCES journey_accounts(id), arrival_event_id TEXT REFERENCES journey_source_events(event_id)
);
