-- Preserve the legacy verdict and rail proof rules. Late acceptance is an
-- independent proof of the same opportunity debt, never a kernel payment.
ALTER TABLE hosted_wallet_market.native_debt_dispositions
  ADD COLUMN IF NOT EXISTS acceptance_kind TEXT NOT NULL DEFAULT 'verdict',
  ADD COLUMN IF NOT EXISTS acceptance_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS acceptance_receipt_sha256 TEXT,
  ALTER COLUMN verdict_id DROP NOT NULL,
  ALTER COLUMN kernel_transfer DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS native_debt_dispositions_kernel_paid_check;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='hosted_wallet_market.native_debt_dispositions'::regclass AND conname='native_debt_acceptance_identity') THEN
    ALTER TABLE hosted_wallet_market.native_debt_dispositions ADD CONSTRAINT native_debt_acceptance_identity CHECK (
      (acceptance_kind='verdict' AND verdict_id IS NOT NULL AND acceptance_operation_id IS NULL
       AND acceptance_receipt_sha256 IS NULL AND kernel_paid AND kernel_transfer IS NOT NULL
       AND kernel_transfer=transaction_hash)
      OR
      (acceptance_kind='late_receipt_v1' AND obligation_family='opportunity' AND proof_kind='erc20_transfer'
       AND verdict_id IS NULL AND acceptance_operation_id IS NOT NULL AND acceptance_operation_id ~ '^[0-9a-f]{64}$'
       AND acceptance_receipt_sha256 IS NOT NULL AND acceptance_receipt_sha256 ~ '^[0-9a-f]{64}$'
       AND NOT kernel_paid AND kernel_transfer IS NULL)
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hosted_wallet_market.native_debt_matches_late_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hosted_wallet_market, pg_temp
AS $$
BEGIN
  IF NEW.acceptance_kind='late_receipt_v1' AND NOT EXISTS (
    SELECT 1 FROM cj227_earned_work.earned_work_idempotency i
    JOIN cj227_earned_work.opportunity_obligations o ON o.id=NEW.obligation_id AND o.claim_id=NEW.claim_id
    JOIN cj227_earned_work.opportunity_rounds r ON r.id=o.round_id AND r.status='closed'
    WHERE i.scope='opportunity_accept_late_private_v1' AND i.task_id=NEW.claim_id
      AND i.key=NEW.acceptance_operation_id AND i.status_code=201
      AND i.principal_id=i.response_json->>'requesterId'
      AND i.response_json @> jsonb_build_object(
        'schema','neomorphic.opportunity-late-acceptance.v1','operationId',NEW.acceptance_operation_id,
        'obligationId',NEW.obligation_id,'claimId',NEW.claim_id,'submissionId',NEW.submission_id,
        'roundId',r.id,'roundKey',r.round_key,'termsVersion',NEW.terms_version,'amountAtomic',NEW.amount_atomic,
        'reservationId',NEW.reservation_id,'destination',NEW.recipient,'paid',false,'settled',false,'transfer',NULL,
        'artifact',jsonb_build_object('digestSha256',NEW.artifact_digest_sha256))
  ) THEN
    RAISE EXCEPTION 'disposition_hold' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS native_debt_dispositions_match_late ON hosted_wallet_market.native_debt_dispositions;
CREATE TRIGGER native_debt_dispositions_match_late
  BEFORE INSERT ON hosted_wallet_market.native_debt_dispositions
  FOR EACH ROW EXECUTE FUNCTION hosted_wallet_market.native_debt_matches_late_acceptance();
