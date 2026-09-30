-- Bounded artifact bytes, per-case witnesses and invocation execution in the existing host.
CREATE TABLE IF NOT EXISTS correspondence_vf04_packages (
 project_id text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
 id text NOT NULL, kind text NOT NULL CHECK(kind IN ('proposal','component')),
 record jsonb NOT NULL, grant_id text NOT NULL, PRIMARY KEY(project_id,id)
);
ALTER TABLE correspondence_vf04_pools ADD COLUMN IF NOT EXISTS participation jsonb;
ALTER TABLE correspondence_vf04_attempts ADD COLUMN IF NOT EXISTS children jsonb NOT NULL DEFAULT '[]';
ALTER TABLE correspondence_vf04_attempts ADD COLUMN IF NOT EXISTS portable_result jsonb;
ALTER TABLE correspondence_vf04_invocations ALTER COLUMN result DROP NOT NULL;
ALTER TABLE correspondence_vf04_invocations ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'completed' CHECK(state IN ('reserved','running','unknown','completed'));
ALTER TABLE correspondence_vf04_invocations ADD COLUMN IF NOT EXISTS execution jsonb;
