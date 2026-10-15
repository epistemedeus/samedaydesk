-- Aggregate personal offers already sent must not become public inventory
-- while the private owner ledger is being reconciled. No identities here.
ALTER TABLE opportunity_offers ADD COLUMN IF NOT EXISTS owner_reserved_slots INTEGER NOT NULL DEFAULT 0
  CHECK (owner_reserved_slots >= 0 AND owner_reserved_slots <= slot_count);
-- Import intent stays fixed when mutable lifecycle fields (e.g. defer_start) change.
ALTER TABLE opportunity_claims ADD COLUMN IF NOT EXISTS import_request_hash TEXT
  CHECK (import_request_hash IS NULL OR import_request_hash ~ '^[a-f0-9]{64}$');
