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
  host_source_sha256 TEXT NOT NULL CHECK (host_source_sha256 ~ '^[0-9a-f]{64}$'),
  earned_schema TEXT NOT NULL CHECK (earned_schema ~ '^[a-z][a-z0-9_]{0,62}$'),
  rpc_endpoint_sha256 TEXT NOT NULL CHECK (rpc_endpoint_sha256 ~ '^[0-9a-f]{64}$'),
  registry_sha256 TEXT NOT NULL CHECK (registry_sha256 ~ '^[0-9a-f]{64}$'),
  profile_sha256 TEXT NOT NULL CHECK (profile_sha256 ~ '^[0-9a-f]{64}$'),
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
  obligation_id TEXT PRIMARY KEY,
  obligation_family TEXT NOT NULL CHECK (obligation_family IN ('earned', 'opportunity')),
  tenant TEXT NOT NULL CHECK (tenant ~ '^[a-z][a-z0-9_-]{2,63}$'),
  reservation_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  verdict_id TEXT NOT NULL,
  artifact_digest_sha256 TEXT NOT NULL CHECK (artifact_digest_sha256 ~ '^[0-9a-f]{64}$'),
  task_id TEXT NOT NULL,
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^sha256:[0-9a-f]{64}$'),
  network TEXT NOT NULL CHECK (network = 'eip155:8453'),
  token TEXT NOT NULL CHECK (token = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'),
  recipient TEXT NOT NULL CHECK (recipient ~ '^0x[a-f0-9]{40}$'),
  transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^0x[a-f0-9]{64}$'),
  log_index INTEGER NOT NULL CHECK (log_index >= 0),
  block_number TEXT NOT NULL CHECK (block_number ~ '^[0-9]+$'),
  block_hash TEXT NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  block_timestamp TIMESTAMPTZ NOT NULL,
  consumer_contract_sha256 TEXT NOT NULL CHECK (consumer_contract_sha256 ~ '^[0-9a-f]{64}$'),
  authority_receipt_sha256 TEXT NOT NULL CHECK (authority_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  amount_atomic TEXT NOT NULL CHECK (amount_atomic ~ '^[1-9][0-9]{0,18}$'),
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
  matches INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hosted_wallet_market.installation i
      JOIN hosted_wallet_market.consumer_enrollment e ON e.id=i.id
      WHERE i.id IS TRUE AND i.tenant=NEW.tenant AND e.tenant=i.tenant AND e.earned_schema=i.earned_schema
      AND i.chain=NEW.network AND i.payments='off' AND e.consumer_contract_sha256=NEW.consumer_contract_sha256) THEN
    RAISE EXCEPTION 'disposition_hold' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.obligation_family = 'earned' THEN
    SELECT count(*) INTO matches FROM cj227_earned_work.earned_work_obligations o
      JOIN cj227_earned_work.earned_work_terms t ON t.task_id=o.task_id AND t.version=o.terms_version
      JOIN cj227_earned_work.earned_work_reservations r ON r.id=o.reservation_id
      JOIN cj227_earned_work.earned_work_submissions s ON s.id=o.submission_id
      JOIN cj227_earned_work.earned_work_verdicts v ON v.id=o.verdict_id
      WHERE o.id=NEW.obligation_id AND o.task_id=NEW.task_id AND o.reservation_id=NEW.claim_id
      AND NEW.claim_id=r.id AND r.status='completed' AND s.id=NEW.submission_id AND v.id=NEW.verdict_id AND v.outcome='pass'
      AND s.reservation_id=r.id AND v.reservation_id=r.id AND v.submission_id=s.id
      AND s.artifact_digest_sha256=NEW.artifact_digest_sha256 AND v.artifact_digest_sha256=s.artifact_digest_sha256
      AND o.payout_state='owed' AND o.terms_version=NEW.terms_version AND r.terms_version=o.terms_version
      AND s.terms_version=o.terms_version AND v.terms_version=o.terms_version
      AND o.reward_amount ~ '^[0-9]+([.][0-9]{1,6})?$' AND o.reward_amount::numeric*1000000=NEW.amount_atomic::numeric AND t.reward_amount=o.reward_amount
      AND o.reward_asset='USDC' AND t.reward_asset=o.reward_asset AND o.reward_network IN ('base','eip155:8453') AND t.reward_network=o.reward_network
      AND lower(o.payout_destination)=NEW.recipient;
  ELSE
    SELECT count(*) INTO matches FROM cj227_earned_work.opportunity_obligations o
      JOIN cj227_earned_work.opportunity_claims c ON c.id=o.claim_id AND c.round_id=o.round_id
      JOIN cj227_earned_work.opportunity_rounds r ON r.id=o.round_id
      JOIN cj227_earned_work.opportunity_offers f ON f.id=c.offer_id AND f.round_id=r.id
      JOIN cj227_earned_work.opportunity_submissions s ON s.claim_id=c.id AND s.round_id=r.id
      WHERE o.id=NEW.obligation_id AND c.id=NEW.claim_id AND s.id=NEW.submission_id
      AND r.round_key || ':' || f.offer_key=NEW.task_id AND c.status='owed'
      AND o.settlement_key=c.settlement_key AND o.terms_version=NEW.terms_version
      AND c.terms_version=o.terms_version AND r.terms_version=o.terms_version AND s.terms_version=o.terms_version
      AND s.artifact_digest_sha256=NEW.artifact_digest_sha256
      AND o.reward_atomic::text=NEW.amount_atomic AND c.reward_atomic=o.reward_atomic AND f.reward_atomic=o.reward_atomic
      AND o.asset='USDC' AND r.asset=o.asset AND o.network=r.network AND o.network IN ('base','eip155:8453')
      AND o.chain_id=8453 AND r.chain_id=8453 AND r.atomic_scale=6
      AND o.payout_state='owed' AND NOT o.paid AND o.transfer IS NULL AND NOT o.settled AND NOT o.revenue;
  END IF;
  IF matches IS DISTINCT FROM 1 THEN
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

-- One owner-authorized successor of the enrolled package. The enrollment row
-- stays. The successor hash is the installed package, never a caller baseline.
CREATE TABLE IF NOT EXISTS hosted_wallet_market.source_succession (
  predecessor_source_sha256 TEXT PRIMARY KEY CHECK (predecessor_source_sha256 ~ '^[0-9a-f]{64}$'),
  successor_source_sha256 TEXT NOT NULL CHECK (
    successor_source_sha256 ~ '^[0-9a-f]{64}$'
    AND successor_source_sha256 <> predecessor_source_sha256
  ),
  successor_host_source_sha256 TEXT NOT NULL CHECK (successor_host_source_sha256 ~ '^[0-9a-f]{64}$'),
  consumer_contract_sha256 TEXT NOT NULL CHECK (consumer_contract_sha256 ~ '^[0-9a-f]{64}$'),
  preservation_sha256 TEXT NOT NULL CHECK (preservation_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION hosted_wallet_market.reject_succession_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hosted_wallet_market, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'succession_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS source_succession_preserve ON hosted_wallet_market.source_succession;
CREATE TRIGGER source_succession_preserve
  BEFORE UPDATE OR DELETE ON hosted_wallet_market.source_succession
  FOR EACH ROW
  EXECUTE FUNCTION hosted_wallet_market.reject_succession_mutation();

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


-- The original opportunity ledger is also archival earned authority.
DROP TRIGGER IF EXISTS opportunity_obligations_preserve ON cj227_earned_work.opportunity_obligations;
CREATE TRIGGER opportunity_obligations_preserve BEFORE UPDATE OR DELETE ON cj227_earned_work.opportunity_obligations
  FOR EACH ROW EXECUTE FUNCTION hosted_wallet_market_guard.reject_legacy_debt_mutation();

-- Once Root has sealed the initial inventory, future obligations join that
-- inventory atomically at their owning insert, including the opportunity
-- producer. Startup cannot strand newly accepted work behind a manual id copy.
CREATE OR REPLACE FUNCTION hosted_wallet_market_guard.track_new_obligation()
RETURNS trigger LANGUAGE plpgsql SET search_path = hosted_wallet_market_guard, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM hosted_wallet_market_guard.obligation_guard_seal WHERE id IS TRUE) THEN
    INSERT INTO hosted_wallet_market_guard.preserved_obligation_ids(id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS track_new_earned_obligation ON cj227_earned_work.earned_work_obligations;
CREATE TRIGGER track_new_earned_obligation AFTER INSERT ON cj227_earned_work.earned_work_obligations
  FOR EACH ROW EXECUTE FUNCTION hosted_wallet_market_guard.track_new_obligation();
DROP TRIGGER IF EXISTS track_new_opportunity_obligation ON cj227_earned_work.opportunity_obligations;
CREATE TRIGGER track_new_opportunity_obligation AFTER INSERT ON cj227_earned_work.opportunity_obligations
  FOR EACH ROW EXECUTE FUNCTION hosted_wallet_market_guard.track_new_obligation();
