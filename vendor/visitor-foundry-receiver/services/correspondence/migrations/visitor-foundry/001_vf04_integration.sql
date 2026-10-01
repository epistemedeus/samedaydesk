-- Explicit opt-in only, after correspondence and VF02, in their selected schema.
-- One budget row per enrolled project, never a global aggregate or lock.
CREATE TABLE IF NOT EXISTS correspondence_vf04_pools (
  project_id text PRIMARY KEY REFERENCES correspondence_projects(id),
  config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS correspondence_vf04_transition_idx
  ON correspondence_idempotency(project_id, ((response_json->>'revision')::integer))
  WHERE scope='vf04:transition';
CREATE TABLE IF NOT EXISTS correspondence_vf04_candidates (
  project_id text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  id text NOT NULL, semantic_key text NOT NULL, cell_id text NOT NULL, submission_id text NOT NULL,
  candidate jsonb NOT NULL, manifest jsonb NOT NULL, artifact jsonb NOT NULL,
  PRIMARY KEY(project_id,id), UNIQUE(project_id,semantic_key), UNIQUE(project_id,submission_id)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_attempts (
  project_id text NOT NULL, id text NOT NULL, candidate_id text NOT NULL,
  assignment jsonb NOT NULL, fence text NOT NULL,
  state text NOT NULL CHECK(state IN ('reserved','running','unknown','result','reconciled')),
  supervisor text, process_identity jsonb, result jsonb, termination jsonb,
  PRIMARY KEY(project_id,id), UNIQUE(project_id,candidate_id),
  FOREIGN KEY(project_id,candidate_id) REFERENCES correspondence_vf04_candidates(project_id,id)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_publications (
  project_id text NOT NULL, candidate_id text NOT NULL, receipt jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','published','withdrawn')),
  published_at timestamptz,
  PRIMARY KEY(project_id,candidate_id),
  FOREIGN KEY(project_id,candidate_id) REFERENCES correspondence_vf04_candidates(project_id,id)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_graph (
  project_id text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  kind text NOT NULL CHECK(kind IN ('version','observation','mutation')), id text NOT NULL,
  record jsonb NOT NULL, authority text NOT NULL,
  PRIMARY KEY(project_id,kind,id)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_shares (
  consumer text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  source text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  PRIMARY KEY(consumer,source), CHECK(consumer<>source)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_manifests (
  project_id text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  id text NOT NULL, record jsonb NOT NULL, PRIMARY KEY(project_id,id)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_gaps (
  project_id text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  id text NOT NULL, record jsonb NOT NULL, PRIMARY KEY(project_id,id)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_experiments (
  project_id text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  id text NOT NULL, digest text NOT NULL, record jsonb NOT NULL,
  frozen_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,id)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_invocations (
  project_id text NOT NULL REFERENCES correspondence_vf04_pools(project_id),
  task_id text NOT NULL, manifest_id text NOT NULL, input_digest text NOT NULL,
  result jsonb NOT NULL, PRIMARY KEY(project_id,task_id)
);
