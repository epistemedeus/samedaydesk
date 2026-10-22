-- Additive account extension in the existing earned-work schema. No historical imports.
CREATE TABLE IF NOT EXISTS journey_accounts (
  id TEXT PRIMARY KEY CHECK (id ~ '^acc_[A-Za-z0-9_-]{16}$'),
  public_profile_id TEXT NOT NULL UNIQUE CHECK (public_profile_id ~ '^prf_[A-Za-z0-9_-]{16}$'),
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80),
  contact_email TEXT CHECK (contact_email IS NULL OR char_length(contact_email) BETWEEN 3 AND 254),
  password_record TEXT NOT NULL,
  recovery_hash TEXT NOT NULL CHECK (recovery_hash ~ '^[a-f0-9]{64}$'),
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS journey_account_sessions (
  id TEXT PRIMARY KEY CHECK (id ~ '^ses_[A-Za-z0-9_-]{16}$'),
  account_id TEXT NOT NULL REFERENCES journey_accounts(id),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  auth_version INTEGER NOT NULL CHECK (auth_version > 0),
  auth_time TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > auth_time),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS journey_account_sessions_account_idx ON journey_account_sessions(account_id);
CREATE TABLE IF NOT EXISTS journey_account_operations (
  operation TEXT NOT NULL CHECK (operation IN ('signup','login','recover')),
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 120),
  proof_hash TEXT NOT NULL CHECK (proof_hash ~ '^[a-f0-9]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  account_id TEXT NOT NULL REFERENCES journey_accounts(id),
  session_id TEXT NOT NULL REFERENCES journey_account_sessions(id),
  auth_version INTEGER NOT NULL,
  sealed_response TEXT NOT NULL CHECK (char_length(sealed_response) <= 4096),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (operation, scope, idempotency_key)
);
CREATE TABLE IF NOT EXISTS journey_account_limits (
  key_hash TEXT PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  window_start TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0)
);
CREATE TABLE IF NOT EXISTS journey_account_kernel_bindings (
  account_id TEXT NOT NULL REFERENCES journey_accounts(id),
  kernel_scope TEXT NOT NULL CHECK (char_length(kernel_scope) BETWEEN 1 AND 128),
  earned_task_id TEXT REFERENCES earned_work_tasks(id),
  opportunity_round_id TEXT REFERENCES opportunity_rounds(id),
  public_id TEXT NOT NULL CHECK (char_length(public_id) <= 120),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  principal_id TEXT UNIQUE REFERENCES earned_work_contributor_tokens(id),
  source TEXT NOT NULL CHECK (source IN ('created','adopted')),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, kernel_scope),
  CHECK ((earned_task_id IS NOT NULL AND opportunity_round_id IS NULL AND kernel_scope = earned_task_id)
      OR (earned_task_id IS NULL AND opportunity_round_id IS NOT NULL AND kernel_scope = 'opportunity:' || opportunity_round_id))
);
