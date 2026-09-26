-- DESTRUCTIVE optional private teardown, never automatic rollback. Stop VF04
-- writers and export VF04 domain tables + both idempotency scopes first.
-- Explicit search_path required. Preserve base correspondence, VF02 and money.
DROP TABLE IF EXISTS correspondence_vf04_invocations;
DROP TABLE IF EXISTS correspondence_vf04_experiments;
DROP TABLE IF EXISTS correspondence_vf04_gaps;
DROP TABLE IF EXISTS correspondence_vf04_manifests;
DROP TABLE IF EXISTS correspondence_vf04_shares;
DROP TABLE IF EXISTS correspondence_vf04_graph;
DROP TABLE IF EXISTS correspondence_vf04_publications;
DROP TABLE IF EXISTS correspondence_vf04_attempts;
DROP TABLE IF EXISTS correspondence_vf04_candidates;
DROP TABLE IF EXISTS correspondence_vf04_pools;
DROP INDEX IF EXISTS correspondence_vf04_transition_idx;
DELETE FROM correspondence_idempotency WHERE scope IN ('vf04:http','vf04:transition');
