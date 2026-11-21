-- Apply in the journey service's configured private schema, never the old intake tables.
CREATE TABLE IF NOT EXISTS journey_submission_drafts (
  account_id text NOT NULL,
  reservation_id text NOT NULL UNIQUE,
  record jsonb NOT NULL,
  PRIMARY KEY (account_id, reservation_id),
  CHECK (record->'draft'->>'accountId' = account_id),
  CHECK (record->'draft'->>'reservationId' = reservation_id)
);
CREATE TABLE IF NOT EXISTS journey_submission_draft_saves (
  account_id text NOT NULL,
  reservation_id text NOT NULL,
  operation_key text NOT NULL,
  request_hash text NOT NULL,
  saved_revision integer NOT NULL CHECK (saved_revision > 0),
  PRIMARY KEY (account_id, reservation_id, operation_key),
  FOREIGN KEY (account_id, reservation_id) REFERENCES journey_submission_drafts(account_id, reservation_id)
);
CREATE OR REPLACE FUNCTION journey_submission_keep_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.record->'frozen' IS DISTINCT FROM 'null'::jsonb AND NEW.record IS DISTINCT FROM OLD.record THEN
    RAISE EXCEPTION 'journey submission delivery is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS journey_submission_immutable ON journey_submission_drafts;
CREATE TRIGGER journey_submission_immutable BEFORE UPDATE ON journey_submission_drafts
FOR EACH ROW EXECUTE FUNCTION journey_submission_keep_frozen();
