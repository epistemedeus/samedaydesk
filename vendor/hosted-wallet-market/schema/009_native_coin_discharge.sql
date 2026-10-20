-- Versioned proof-kind succession in the existing exclusive discharge table.
-- Legacy obligations, dispositions, terms, and enrollment are retained in place.
ALTER TABLE hosted_wallet_market.native_debt_dispositions ADD COLUMN IF NOT EXISTS proof_kind TEXT NOT NULL DEFAULT 'erc20_transfer';
ALTER TABLE hosted_wallet_market.native_debt_dispositions ADD COLUMN IF NOT EXISTS reward_asset JSONB;
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
