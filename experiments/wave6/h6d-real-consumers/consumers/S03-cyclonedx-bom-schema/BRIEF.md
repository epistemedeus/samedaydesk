# S03-cyclonedx-bom-schema

Family: `schemaWebhook`
useful-jobs 1.4.0 job: `json-schema-webhook-drift`
Exclusive path: `experiments/wave6/h6d-real-consumers/consumers/S03-cyclonedx-bom-schema/`
Official source: `CycloneDX/specification` path `schema/bom-1.6.schema.json`
Candidate SHAs: `80db0257f118` → `0bd48c88d1b1`
License hint: Apache-2.0 or CDDL (record actual)

Official CycloneDX JSON Schema. 80db0257f118 → 0bd48c88d1b1 (typo/content-type). If used structural pointers are unchanged, that is a VALID control-like positive of 'compatible/unchanged' — still ship a second used pointer that DID change across tags 1.5 (c320fc0f0b46 schema/bom-1.5.schema.json) vs 1.6 (55343ba19dee schema/bom-1.6.schema.json) as the version-pair, documenting they are official spec versions not the same filename. Do not invent required-field breaks.

Read `experiments/wave6/h6d-real-consumers/docs/CHILD-CONTRACT.md` and follow it exactly.
Resolve full 40-char SHAs via GitHub API or git. Store provenance. Independent witness. Positive/control/negative tests.
Receiving integration owner: H6D parent catalog + `bin/select-job.mjs`.
Write RESULT.json when done.
