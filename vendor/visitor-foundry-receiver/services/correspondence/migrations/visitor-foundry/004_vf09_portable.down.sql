DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM correspondence_vf04_packages)
 OR EXISTS(SELECT 1 FROM correspondence_vf04_attempts WHERE children<>'[]'::jsonb OR portable_result IS NOT NULL)
 OR EXISTS(SELECT 1 FROM correspondence_vf04_invocations WHERE execution IS NOT NULL)
 OR EXISTS(SELECT 1 FROM correspondence_vf04_pools WHERE participation IS NOT NULL)
 THEN RAISE EXCEPTION 'portable_history_requires_archival_before_downgrade'; END IF;
END $$;
DROP TABLE correspondence_vf04_packages;
ALTER TABLE correspondence_vf04_pools DROP COLUMN participation;
ALTER TABLE correspondence_vf04_attempts DROP COLUMN children,DROP COLUMN portable_result;
ALTER TABLE correspondence_vf04_invocations DROP COLUMN state,DROP COLUMN execution;
ALTER TABLE correspondence_vf04_invocations ALTER COLUMN result SET NOT NULL;
