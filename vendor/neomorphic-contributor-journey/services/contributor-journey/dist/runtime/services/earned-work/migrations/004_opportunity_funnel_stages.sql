-- Honest funnel stages. Additive only: claim rows, terms, and obligations stay as stored.
-- Holder acknowledgement is one event per reservation. Channel is an explicit observation.

ALTER TABLE opportunity_cohort_events ADD COLUMN IF NOT EXISTS channel TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'opportunity_cohort_events'::regclass
      AND conname = 'opportunity_cohort_events_channel_check'
  ) THEN
    ALTER TABLE opportunity_cohort_events
      ADD CONSTRAINT opportunity_cohort_events_channel_check
      CHECK (channel IS NULL OR channel IN ('email', 'http', 'operator'));
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'opportunity_events'::regclass
      AND c.contype = 'c'
  LOOP
    -- Deparse only this relation's constraints. A joined catalog filter can
    -- evaluate pg_get_constraintdef on another schema before filtering it,
    -- racing that unrelated schema's DDL during a retained restart.
    IF pg_get_constraintdef(r.oid) ILIKE '%kind%' THEN
      EXECUTE format('ALTER TABLE opportunity_events DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;
END $$;

ALTER TABLE opportunity_events
  ADD CONSTRAINT opportunity_events_kind_check
  CHECK (kind IN (
    'encounter', 'listing', 'claim', 'submission', 'acceptance', 'owed',
    'paid_observation', 'useful_reuse', 'repeat', 'import', 'waitlist', 'notice',
    'holder_acknowledgement'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_events_holder_ack_once
  ON opportunity_events (claim_id)
  WHERE kind = 'holder_acknowledgement';
