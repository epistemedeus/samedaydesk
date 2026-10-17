-- Additive private schema. Does not ALTER earned_work_* or journey_accounts columns.
-- Does not copy environment values. Session delivery stores a cookie hash, never the cookie.
-- Schema hosted_wallet_market_guard holds the obligation id list, the operator seal,
-- and the trigger function. The trigger refuses UPDATE and DELETE of every
-- earned_work_obligations row. That refusal does not depend on migration 005.
-- Production rollback does not drop this schema. It disables the adapter and
-- keeps proofs, quotes, funding intents, dispositions, and enrollment.
-- DROP SCHEMA hosted_wallet_market CASCADE is only an explicit disposable
-- teardown. That drop does not drop the guard schema and does not drop trigger
-- earned_work_obligations_preserve_legacy. Earned obligations and journey rows stay.

CREATE SCHEMA IF NOT EXISTS hosted_wallet_market;

CREATE TABLE IF NOT EXISTS hosted_wallet_market.roles (
  account_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.journey_accounts(id),
  role TEXT NOT NULL CHECK (role IN ('requester', 'contributor'))
);

-- Tighten an existing table. An authority row makes ADD CONSTRAINT fail closed.
ALTER TABLE hosted_wallet_market.roles DROP CONSTRAINT IF EXISTS roles_role_check;
ALTER TABLE hosted_wallet_market.roles
  ADD CONSTRAINT roles_role_check CHECK (role IN ('requester', 'contributor'));

CREATE TABLE IF NOT EXISTS hosted_wallet_market.proofs (
  proof_hash TEXT PRIMARY KEY CHECK (proof_hash ~ '^[a-f0-9]{64}$'),
  account_id TEXT NOT NULL REFERENCES cj227_earned_work.journey_accounts(id)
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.session_delivery (
  account_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.journey_accounts(id),
  cookie_hash TEXT NOT NULL CHECK (cookie_hash ~ '^[a-f0-9]{64}$'),
  csrf TEXT NOT NULL CHECK (csrf ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.wallets (
  account_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.journey_accounts(id),
  address TEXT NOT NULL CHECK (address ~ '^0x[a-f0-9]{40}$'),
  revocation_epoch INTEGER NOT NULL DEFAULT 0 CHECK (revocation_epoch >= 0),
  exported BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.quotes (
  task_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.earned_work_tasks(id),
  requester_account_id TEXT NOT NULL REFERENCES cj227_earned_work.journey_accounts(id),
  fee_recipient TEXT NOT NULL CHECK (fee_recipient ~ '^0x[a-f0-9]{40}$'),
  economics JSONB NOT NULL,
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^sha256:[0-9a-f]{64}$'),
  authorization_expiry TIMESTAMPTZ NOT NULL,
  refund_expiry TIMESTAMPTZ NOT NULL,
  funding_wire TEXT NOT NULL CHECK (funding_wire IN (
    'unfunded', 'signature_prepared', 'balance_observed', 'submitted', 'confirmed_usable'
  )),
  funded BOOLEAN NOT NULL,
  observations JSONB NOT NULL,
  proof_id TEXT,
  contributor_account_id TEXT,
  payout_destination TEXT,
  chain_id TEXT,
  block_number TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (authorization_expiry = refund_expiry),
  CHECK (funded = (funding_wire = 'confirmed_usable'))
);

-- One transaction hash funds one task. Unfunded quotes keep a null proof id.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_funding_evidence_key
  ON hosted_wallet_market.quotes (proof_id)
  WHERE proof_id IS NOT NULL;

-- The signed funding intent is recorded before the transfer. One row per task.
CREATE TABLE IF NOT EXISTS hosted_wallet_market.funding_intents (
  task_id TEXT PRIMARY KEY REFERENCES hosted_wallet_market.quotes(task_id),
  account_id TEXT NOT NULL REFERENCES cj227_earned_work.journey_accounts(id),
  tenant TEXT NOT NULL,
  payer TEXT NOT NULL CHECK (payer ~ '^0x[a-f0-9]{40}$'),
  not_before_block BIGINT NOT NULL CHECK (not_before_block >= 0),
  message TEXT NOT NULL,
  authorized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.bindings (
  task_id TEXT NOT NULL REFERENCES cj227_earned_work.earned_work_tasks(id),
  account_id TEXT NOT NULL REFERENCES cj227_earned_work.journey_accounts(id),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (task_id, account_id)
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.grants (
  account_id TEXT NOT NULL REFERENCES cj227_earned_work.journey_accounts(id),
  task_id TEXT NOT NULL REFERENCES cj227_earned_work.earned_work_tasks(id),
  token_id TEXT NOT NULL UNIQUE REFERENCES cj227_earned_work.earned_work_contributor_tokens(id),
  public_id TEXT NOT NULL CHECK (char_length(public_id) <= 120),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, task_id)
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.delivery (
  reservation_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.earned_work_reservations(id),
  task_id TEXT NOT NULL REFERENCES cj227_earned_work.earned_work_tasks(id),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  raw_sha256 TEXT NOT NULL CHECK (raw_sha256 ~ '^[a-f0-9]{64}$'),
  business_status TEXT NOT NULL,
  body_bytes INTEGER NOT NULL CHECK (body_bytes >= 1 AND body_bytes <= 16384),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.reviews (
  reservation_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.earned_work_reservations(id),
  task_id TEXT NOT NULL REFERENCES cj227_earned_work.earned_work_tasks(id),
  state TEXT NOT NULL CHECK (state IN (
    'claimed', 'submitted', 'verdict', 'approval_pending', 'accepted', 'closed_without_debt'
  )),
  verdict_id TEXT,
  winner TEXT CHECK (winner IS NULL OR winner IN (
    'authorized_capture', 'escrow_expiry', 'reclaim', 'refund', 'operator_capture'
  )),
  obligation_id TEXT,
  operator_incidents INTEGER NOT NULL DEFAULT 0 CHECK (operator_incidents >= 0),
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.captures (
  task_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.earned_work_tasks(id),
  reservation_id TEXT NOT NULL UNIQUE REFERENCES cj227_earned_work.earned_work_reservations(id),
  obligation_id TEXT NOT NULL UNIQUE REFERENCES cj227_earned_work.earned_work_obligations(id),
  gross_atomic BIGINT NOT NULL CHECK (gross_atomic > 0),
  rail_atomic BIGINT NOT NULL CHECK (rail_atomic >= 0),
  fee_atomic BIGINT NOT NULL CHECK (fee_atomic >= 0),
  net_atomic BIGINT NOT NULL CHECK (net_atomic >= 0),
  fee_bps INTEGER NOT NULL CHECK (fee_bps = 500),
  chain TEXT NOT NULL CHECK (
    chain ~ '^eip155:[0-9]+$'
    AND chain NOT IN ('eip155:1', 'eip155:8453', 'eip155:84532')
  ),
  block_number TEXT NOT NULL CHECK (block_number ~ '^[0-9]+$'),
  transfer BOOLEAN NOT NULL CHECK (transfer = FALSE),
  winner TEXT NOT NULL CHECK (winner = 'authorized_capture'),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (fee_atomic = trunc(gross_atomic * 500::numeric / 10000)::bigint),
  CHECK (net_atomic = gross_atomic - fee_atomic - rail_atomic)
);

CREATE TABLE IF NOT EXISTS hosted_wallet_market.installation (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  tenant TEXT NOT NULL CHECK (tenant ~ '^[a-z][a-z0-9_-]{2,63}$'),
  earned_schema TEXT NOT NULL CHECK (earned_schema ~ '^[a-z][a-z0-9_]{0,62}$'),
  chain TEXT NOT NULL CHECK (
    chain ~ '^eip155:[0-9]+$'
    AND chain <> 'eip155:1'
  ),
  payments TEXT NOT NULL CHECK (payments = 'off')
);

-- One enrolled consumer. The row stores hashes, never an RPC URL and never a
-- caller-supplied paid or installed flag. A repeated apply does not alter a
-- table that already exists.
CREATE TABLE IF NOT EXISTS hosted_wallet_market.consumer_enrollment (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  import_contract_sha256 TEXT NOT NULL CHECK (import_contract_sha256 = '414ba86df5bfacd2876f38bd62d11781e9c9971cd8219ceec577f85dc0f93063'),
  consumer_contract_sha256 TEXT NOT NULL CHECK (consumer_contract_sha256 ~ '^[0-9a-f]{64}$'),
  tenant TEXT NOT NULL CHECK (tenant ~ '^[a-z][a-z0-9_-]{2,63}$'),
  network TEXT NOT NULL CHECK (network = 'eip155:8453'),
  token TEXT NOT NULL CHECK (token = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'),
  rpc_origin_sha256 TEXT NOT NULL CHECK (rpc_origin_sha256 ~ '^[0-9a-f]{64}$'),
  profile_chain TEXT NOT NULL CHECK (profile_chain = 'eip155:8453'),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION hosted_wallet_market.reject_enrollment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hosted_wallet_market, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'enrollment_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS consumer_enrollment_preserve ON hosted_wallet_market.consumer_enrollment;
CREATE TRIGGER consumer_enrollment_preserve
  BEFORE UPDATE OR DELETE ON hosted_wallet_market.consumer_enrollment
  FOR EACH ROW
  EXECUTE FUNCTION hosted_wallet_market.reject_enrollment_mutation();

-- One verified external discharge. Rail checks stay Base/USDC. Identity,
-- amount, log, block, receipt, and timestamp are not pinned to one payment.
-- kernel_paid is the bound projection. transfer_initiated stays false because
-- this table does not send a transfer. payout_state stays owed because the
-- archival obligation row is not rewritten. A repeated apply of this file does
-- not alter a table that already exists. This file does not apply it live.
CREATE TABLE IF NOT EXISTS hosted_wallet_market.native_debt_dispositions (
  obligation_id TEXT PRIMARY KEY REFERENCES cj227_earned_work.earned_work_obligations(id),
  tenant TEXT NOT NULL CHECK (tenant ~ '^[a-z][a-z0-9_-]{2,63}$'),
  reservation_id TEXT NOT NULL REFERENCES cj227_earned_work.earned_work_reservations(id),
  task_id TEXT NOT NULL REFERENCES cj227_earned_work.earned_work_tasks(id),
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^sha256:[0-9a-f]{64}$'),
  network TEXT NOT NULL CHECK (network = 'eip155:8453'),
  token TEXT NOT NULL CHECK (token = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'),
  recipient TEXT NOT NULL CHECK (recipient ~ '^0x[a-f0-9]{40}$'),
  transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^0x[a-f0-9]{64}$'),
  log_index INTEGER NOT NULL CHECK (log_index >= 0),
  block_number TEXT NOT NULL CHECK (block_number ~ '^[0-9]+$'),
  amount_atomic TEXT NOT NULL CHECK (amount_atomic ~ '^(0|[1-9][0-9]{0,18})$'),
  receipt_id TEXT NOT NULL CHECK (receipt_id ~ '^[0-9a-f]{64}$'),
  received_at TIMESTAMPTZ NOT NULL,
  import_contract_sha256 TEXT NOT NULL CHECK (import_contract_sha256 = '414ba86df5bfacd2876f38bd62d11781e9c9971cd8219ceec577f85dc0f93063'),
  import_state TEXT NOT NULL CHECK (import_state = 'bound'),
  disposition TEXT NOT NULL CHECK (disposition = 'external_discharge_allocated'),
  kernel_paid BOOLEAN NOT NULL CHECK (kernel_paid),
  kernel_transfer TEXT NOT NULL CHECK (kernel_transfer ~ '^0x[a-f0-9]{64}$'),
  native_paid_observation BOOLEAN NOT NULL CHECK (native_paid_observation),
  transfer_initiated BOOLEAN NOT NULL CHECK (transfer_initiated = FALSE),
  payout_state TEXT NOT NULL CHECK (payout_state = 'owed'),
  observed_source TEXT NOT NULL CHECK (observed_source ~ '^0x[a-f0-9]{40}$'),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT native_debt_reservation_allocation UNIQUE (reservation_id),
  CONSTRAINT native_debt_transfer_allocation UNIQUE (network, token, transaction_hash, log_index),
  CHECK (kernel_transfer = transaction_hash)
);

CREATE OR REPLACE FUNCTION hosted_wallet_market.reject_native_debt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hosted_wallet_market, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'disposition_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS native_debt_dispositions_preserve ON hosted_wallet_market.native_debt_dispositions;
CREATE TRIGGER native_debt_dispositions_preserve
  BEFORE UPDATE OR DELETE ON hosted_wallet_market.native_debt_dispositions
  FOR EACH ROW
  EXECUTE FUNCTION hosted_wallet_market.reject_native_debt_mutation();

CREATE OR REPLACE FUNCTION hosted_wallet_market.native_debt_matches_obligation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hosted_wallet_market, pg_temp
AS $$
DECLARE
  stored RECORD;
  installed_tenant TEXT;
BEGIN
  SELECT tenant INTO installed_tenant FROM hosted_wallet_market.installation WHERE id IS TRUE;
  IF installed_tenant IS NULL OR installed_tenant IS DISTINCT FROM NEW.tenant THEN
    RAISE EXCEPTION 'disposition_hold' USING ERRCODE = 'P0001';
  END IF;
  SELECT task_id, reservation_id, terms_version, reward_amount, reward_asset, reward_network,
         payout_state, payout_destination
    INTO stored
    FROM cj227_earned_work.earned_work_obligations
    WHERE id = NEW.obligation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'disposition_hold' USING ERRCODE = 'P0001';
  END IF;
  IF stored.payout_state IS DISTINCT FROM 'owed'
     OR stored.reward_asset IS DISTINCT FROM 'USDC'
     OR stored.reward_network IS DISTINCT FROM NEW.network
     OR stored.reward_amount IS DISTINCT FROM NEW.amount_atomic
     OR stored.terms_version IS DISTINCT FROM NEW.terms_version
     OR stored.task_id IS DISTINCT FROM NEW.task_id
     OR stored.reservation_id IS DISTINCT FROM NEW.reservation_id
     OR lower(stored.payout_destination) IS DISTINCT FROM NEW.recipient
  THEN
    RAISE EXCEPTION 'disposition_hold' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS native_debt_dispositions_match ON hosted_wallet_market.native_debt_dispositions;
CREATE TRIGGER native_debt_dispositions_match
  BEFORE INSERT ON hosted_wallet_market.native_debt_dispositions
  FOR EACH ROW
  EXECUTE FUNCTION hosted_wallet_market.native_debt_matches_obligation();

CREATE SCHEMA IF NOT EXISTS hosted_wallet_market_guard;

CREATE TABLE IF NOT EXISTS hosted_wallet_market_guard.preserved_obligation_ids (
  id TEXT PRIMARY KEY
);

-- One row, written by the operator after the id copy. The server never inserts it.
CREATE TABLE IF NOT EXISTS hosted_wallet_market_guard.obligation_guard_seal (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  sealed_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION hosted_wallet_market_guard.reject_legacy_debt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hosted_wallet_market_guard, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'obligation_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS earned_work_obligations_preserve_legacy ON cj227_earned_work.earned_work_obligations;
CREATE TRIGGER earned_work_obligations_preserve_legacy
  BEFORE UPDATE OR DELETE ON cj227_earned_work.earned_work_obligations
  FOR EACH ROW
  EXECUTE FUNCTION hosted_wallet_market_guard.reject_legacy_debt_mutation();

