-- Additive control evidence on the existing wallet descriptor. Old declared
-- addresses have no proof; this migration never grants control retroactively.
ALTER TABLE hosted_wallet_market.wallets ADD COLUMN IF NOT EXISTS control_epoch INTEGER;
ALTER TABLE hosted_wallet_market.wallets ADD COLUMN IF NOT EXISTS control_digest TEXT;
ALTER TABLE hosted_wallet_market.wallets ADD COLUMN IF NOT EXISTS control_challenge JSONB;
