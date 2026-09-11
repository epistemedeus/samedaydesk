CREATE TABLE IF NOT EXISTS paid_batch_ledger (
  batch_id TEXT PRIMARY KEY,
  terms_version TEXT,
  status TEXT NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT FALSE CHECK (sold = FALSE),
  ledger JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS paid_batch_items (
  batch_id TEXT NOT NULL REFERENCES paid_batch_ledger(batch_id),
  item_id TEXT NOT NULL,
  engine_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  funding_state TEXT NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT FALSE CHECK (sold = FALSE),
  price_kind TEXT NOT NULL,
  price_usdc TEXT NOT NULL,
  PRIMARY KEY (batch_id, item_id)
);
