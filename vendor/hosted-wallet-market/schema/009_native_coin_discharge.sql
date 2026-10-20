-- Versioned proof-kind succession in the existing exclusive discharge table.
-- Legacy obligations, dispositions, terms, and enrollment are retained in place.
ALTER TABLE hosted_wallet_market.native_debt_dispositions ADD COLUMN IF NOT EXISTS proof_kind TEXT NOT NULL DEFAULT 'erc20_transfer';
ALTER TABLE hosted_wallet_market.native_debt_dispositions ADD COLUMN IF NOT EXISTS reward_asset JSONB;
ALTER TABLE hosted_wallet_market.native_debt_dispositions ADD COLUMN IF NOT EXISTS fee_evidence JSONB;
ALTER TABLE hosted_wallet_market.native_debt_dispositions ALTER COLUMN token DROP NOT NULL;
ALTER TABLE hosted_wallet_market.native_debt_dispositions ALTER COLUMN log_index DROP NOT NULL;
ALTER TABLE hosted_wallet_market.native_debt_dispositions DROP CONSTRAINT IF EXISTS native_debt_dispositions_import_contract_sha256_check;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='hosted_wallet_market.native_debt_dispositions'::regclass AND conname='native_debt_proof_identity') THEN
 ALTER TABLE hosted_wallet_market.native_debt_dispositions ADD CONSTRAINT native_debt_proof_identity CHECK (
  (proof_kind='erc20_transfer' AND reward_asset IS NULL AND token='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' AND token IS NOT NULL AND log_index IS NOT NULL AND log_index>=0
   AND import_contract_sha256='414ba86df5bfacd2876f38bd62d11781e9c9971cd8219ceec577f85dc0f93063') OR
  (proof_kind='native_value_transfer' AND token IS NULL AND log_index IS NULL AND reward_asset IS NOT NULL
   AND reward_asset='{"schema":"pilot.reward-asset.v1","kind":"native","chainId":8453,"symbol":"ETH","decimals":18,"denomination":"wei"}'::jsonb
   AND import_contract_sha256='2c8cfee3bfeb50027a9827063e4c92d15ae431490b44f656a9fd726ee2fb7e79')
 );
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS native_debt_native_effect ON hosted_wallet_market.native_debt_dispositions(network,transaction_hash) WHERE proof_kind='native_value_transfer';

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
    IF NEW.proof_kind <> 'erc20_transfer' THEN RAISE EXCEPTION 'disposition_hold'; END IF;
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
      AND r.asset=o.asset AND o.network=r.network AND o.network IN ('base','eip155:8453')
      AND o.chain_id=8453 AND r.chain_id=8453
      AND ((NEW.proof_kind='erc20_transfer' AND o.asset='USDC' AND r.atomic_scale=6 AND r.terms_document->'rewardAsset' IS NULL)
        OR (NEW.proof_kind='native_value_transfer' AND o.asset='ETH' AND r.atomic_scale=18
          AND r.terms_document->>'schema'='neomorphic.opportunity-round.terms.v2'
          AND r.terms_document->'schemaVersion'='2'::jsonb AND r.terms_document->'rewardAsset'=NEW.reward_asset))
      AND o.payout_state='owed' AND NOT o.paid AND o.transfer IS NULL AND NOT o.settled AND NOT o.revenue;
  END IF;
  IF matches IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'disposition_hold' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

