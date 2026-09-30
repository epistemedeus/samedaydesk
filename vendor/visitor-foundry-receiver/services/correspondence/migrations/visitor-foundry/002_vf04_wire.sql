-- Additive receiving amendment. Existing foundation records are not rewritten.
CREATE TABLE IF NOT EXISTS correspondence_vf04_identities (
  project_id text NOT NULL REFERENCES correspondence_projects(id),
  coordinate_key text NOT NULL,
  original jsonb NOT NULL,
  native jsonb NOT NULL,
  PRIMARY KEY(project_id,coordinate_key)
);
CREATE TABLE IF NOT EXISTS correspondence_vf04_environment_evidence (
  project_id text NOT NULL REFERENCES correspondence_projects(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(project_id,id)
);
