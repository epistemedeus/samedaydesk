-- Explicit account-native v3 succession. No data rewrite or old-schema reinterpretation.
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
          AND r.terms_document->'rewardAsset'=NEW.reward_asset
          AND ((r.terms_document->>'schema'='neomorphic.opportunity-round.terms.v2'
            AND r.terms_document->'schemaVersion'='2'::jsonb)
          OR (r.terms_document->>'schema'='neomorphic.opportunity-round.terms.v3'
            AND r.terms_document->'schemaVersion'='3'::jsonb
            AND r.terms_document->>'receivingPolicy'='account_native_reward_v1'
            AND r.terms_document->'accountNative'->>'schema'='neomorphic.account-native-profile.v1'
            AND r.terms_document->'accountNative'->>'payoutDestination'=NEW.recipient
            AND f.slot_count=1 AND f.owner_reserved_slots=1 AND NOT f.public_claimable
            AND c.kind='owner_assigned'
            AND EXISTS (SELECT 1 FROM cj227_earned_work.journey_account_kernel_bindings b
              JOIN cj227_earned_work.journey_task_links j ON j.opportunity_round_id=r.id AND j.task_id=NEW.task_id
              WHERE b.principal_id=c.contributor_token_id AND b.account_id=c.credential_ref
              AND b.kernel_scope='opportunity:' || r.id
              AND j.requester_account_id=r.terms_document->'accountNative'->>'requesterAccountId'
              AND j.requester_account_id<>b.account_id)))))
      AND o.payout_state='owed' AND NOT o.paid AND o.transfer IS NULL AND NOT o.settled AND NOT o.revenue;
  END IF;
  IF matches IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'disposition_hold' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

