# R01-github-rest-routes

Family: `apiRoutes`
useful-jobs 1.4.0 job: `api-upgrade-brief`
Exclusive path: `experiments/wave6/h6d-real-consumers/consumers/R01-github-rest-routes/`
Official source: `github/rest-api-description` path `descriptions/api.github.com/api.github.com.yaml (or .json) — store ONLY a tiny used-ops subset, not the full spec`
Candidate SHAs: `f5d6d10f019d` → `e16cc2584c6d`
License hint: MIT

Actual GitHub REST OpenAPI, 2026-09-11 → 2026-09-12. NOT OpenAI. Extract ≤15 used operations (issues/pulls/git blobs) into before/after YAML plus used.json {method,path}. Run api-upgrade-brief. Independent witness = set of method+path (+ optional operationId). Optional: project path list into SDS route-table.v1 {path,canonical,title} for route-table-diff, labeled non-equivalent (method is dropped). Do not store multi-MB specs in git; keep bounded excerpts + full-blob sha256.

Read `experiments/wave6/h6d-real-consumers/docs/CHILD-CONTRACT.md` and follow it exactly.
Resolve full 40-char SHAs via GitHub API or git. Store provenance. Independent witness. Positive/control/negative tests.
Receiving integration owner: H6D parent catalog + `bin/select-job.mjs`.
Write RESULT.json when done.
