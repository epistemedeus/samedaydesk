-- No lossy downgrade: retain maintained rounds, even generation-1 profile/
-- validity bindings, and installed maintenance decisions. No fallback to legacy
-- one-hour validity for a receipt with a different recorded original lifetime.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM correspondence_vf04_candidates WHERE generation>1)
 OR EXISTS(SELECT 1 FROM correspondence_vf04_attempts WHERE generation>1)
 OR EXISTS(SELECT 1 FROM correspondence_vf04_publications WHERE generation>1)
 OR EXISTS(SELECT 1 FROM correspondence_vf04_attempts WHERE verification IS NOT NULL)
 OR EXISTS(SELECT 1 FROM correspondence_vf04_publications WHERE verification IS NOT NULL)
 OR EXISTS(SELECT 1 FROM correspondence_idempotency WHERE scope='vf04:maintenance')
 THEN RAISE EXCEPTION 'revalidation_history_requires_archival_before_downgrade'; END IF;
END $$;
ALTER TABLE correspondence_vf04_publications DROP CONSTRAINT correspondence_vf04_publications_pkey;
ALTER TABLE correspondence_vf04_publications ADD PRIMARY KEY(project_id,candidate_id);
DROP INDEX IF EXISTS correspondence_vf04_attempt_generation_idx;
ALTER TABLE correspondence_vf04_attempts ADD UNIQUE(project_id,candidate_id);
ALTER TABLE correspondence_vf04_publications DROP COLUMN verification,DROP COLUMN generation;
ALTER TABLE correspondence_vf04_attempts DROP COLUMN verification,DROP COLUMN generation;
ALTER TABLE correspondence_vf04_candidates DROP COLUMN verification,DROP COLUMN generation;
ALTER TABLE correspondence_vf04_pools DROP COLUMN verification;
