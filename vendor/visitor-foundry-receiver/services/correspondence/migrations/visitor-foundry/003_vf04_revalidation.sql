-- Preserve candidates/artifacts and all original attempt/receipt rows.
ALTER TABLE correspondence_vf04_pools ADD COLUMN IF NOT EXISTS verification jsonb;
ALTER TABLE correspondence_vf04_candidates ADD COLUMN IF NOT EXISTS generation integer NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 4);
ALTER TABLE correspondence_vf04_candidates ADD COLUMN IF NOT EXISTS verification jsonb;
ALTER TABLE correspondence_vf04_attempts ADD COLUMN IF NOT EXISTS generation integer NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 4);
ALTER TABLE correspondence_vf04_attempts ADD COLUMN IF NOT EXISTS verification jsonb;
ALTER TABLE correspondence_vf04_attempts DROP CONSTRAINT IF EXISTS correspondence_vf04_attempts_project_id_candidate_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS correspondence_vf04_attempt_generation_idx ON correspondence_vf04_attempts(project_id,candidate_id,generation);
ALTER TABLE correspondence_vf04_publications ADD COLUMN IF NOT EXISTS generation integer NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 4);
ALTER TABLE correspondence_vf04_publications ADD COLUMN IF NOT EXISTS verification jsonb;
ALTER TABLE correspondence_vf04_publications DROP CONSTRAINT IF EXISTS correspondence_vf04_publications_pkey;
ALTER TABLE correspondence_vf04_publications ADD PRIMARY KEY(project_id,candidate_id,generation);
