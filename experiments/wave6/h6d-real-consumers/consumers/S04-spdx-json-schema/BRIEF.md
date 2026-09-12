# S04-spdx-json-schema

Family: `schemaWebhook`
useful-jobs 1.4.0 job: `json-schema-webhook-drift`
Exclusive path: `experiments/wave6/h6d-real-consumers/consumers/S04-spdx-json-schema/`
Official source: `spdx/spdx-spec` path `schemas/spdx-schema-2-3.json vs schemas/spdx-schema-3-0-1.json`
Candidate SHAs: `61a7a341f253` → `61a7a341f253`
License hint: Community-Spec-1.0 / CC-BY-3.0 (record actual LICENSE)

Maintained official SPDX JSON schemas in one repo (2.3 vs 3.0.1). Same restore commit may hold both files — that is a versioned schema pair, not a fake git delta. Used pointers that exist in both (e.g. SPDX version / name fields) plus pointers only in 3.x. Independent witness. Negative: YAML OpenAPI.

Read `experiments/wave6/h6d-real-consumers/docs/CHILD-CONTRACT.md` and follow it exactly.
Resolve full 40-char SHAs via GitHub API or git. Store provenance. Independent witness. Positive/control/negative tests.
Receiving integration owner: H6D parent catalog + `bin/select-job.mjs`.
Write RESULT.json when done.
