# S01-jsonschema-recursive-anchor

Family: `schemaWebhook`
useful-jobs 1.4.0 job: `json-schema-webhook-drift`
Exclusive path: `experiments/wave6/h6d-real-consumers/consumers/S01-jsonschema-recursive-anchor/`
Official source: `json-schema-org/json-schema-spec` path `schema.json`
Candidate SHAs: `63fbd7bf561a` → `c028e943ab21`
License hint: Apache-2.0 OR BSD-3-Clause (record actual LICENSE at SHA)

JSON Schema meta-schema. Candidate: 63fbd7bf561a (fix broken reference) → c028e943ab21 (fix the type for $recursiveAnchor). Used pointers MUST include the changed keyword (e.g. /$recursiveAnchor or /properties/$recursiveAnchor — verify). Do NOT reuse H04 exclusiveMinimum pair d4c5b3a2→4b495a29. Not OpenAPI. Remote $ref refuse as negative.

Read `experiments/wave6/h6d-real-consumers/docs/CHILD-CONTRACT.md` and follow it exactly.
Resolve full 40-char SHAs via GitHub API or git. Store provenance. Independent witness. Positive/control/negative tests.
Receiving integration owner: H6D parent catalog + `bin/select-job.mjs`.
Write RESULT.json when done.
