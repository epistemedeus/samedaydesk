# S04 SPDX JSON Schema — result

Status: **pass**. `NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs` → **11 pass / 0 fail**.

## Source

Official `spdx/spdx-spec` restore commit `61a7a341f2533d6e084c48c88463da63f05e1af0` (2026-04-24) holds both:

- `schemas/spdx-schema-2-3.json` (45305 bytes, sha256 `ca7fd7cc2c8107c3b6b5976058bb72363e8c072f0e446609d4fe7234860c2894`)
- `schemas/spdx-schema-3-0-1.json` (235595 bytes, sha256 `19d65705ee474fb99467b5e006e05cab61b561974da34ff0e4a188bcf039387c`)

Same SHA for before and after is a **versioned official pair**, not a fabricated git delta.

**LICENSE** at that commit: Community-Spec-1.0 for the specification; CC-BY-3.0 for pre-existing portions; MIT for `bin/pull-license-list.py`. Stored at `fixtures/official/LICENSE`.

## Job

useful-jobs **1.4.0** `json-schema-webhook-drift` via cold adapter (`adapter.mjs`). Kit sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`. Receiving owner: **H6D-parent** / `bin/select-job.mjs`.

Used pointers: `/type`, `/$schema`, `/properties` (exist in both); `/properties/name`, `/properties/spdxVersion` (2.3); `/properties/@context`, `/$defs`, `/oneOf` (3.x).

## Engine vs independent witness

Witness is RFC 6901 + canonical JSON equality (`witness.mjs`). It does not import kit compare modules.

Agree:

- added: `/properties/@context`, `/$defs`, `/oneOf`
- removed: `/properties/name`, `/properties/spdxVersion`
- unchanged: `/type` (`"object"`)

Disagree (engine unmodified; see `regression-artifact.json`):

- `/$schema` URI draft-07 → 2020-12: witness **changed**, engine **unchanged** (string literal fingerprint is jsonType only)
- `/properties` map 2.3 fields → 3.x `@context`: witness **changed**, engine **unchanged** (fingerprints the map as a schema-object and ignores sibling keys)

Positive engine status: **actionable**. Control identical 2.3: **partial** (3.x pointers absent-in-both = unknown, not deleted). Control `/type` only across the pair: **informational**.

## Negatives

- YAML OpenAPI → `not-json` (job has no YAML parser)
- JSON OpenAPI → `not-this-job-openapi`
- missing `--used` → `missing-required-inputs`

## Honesty

Not a sale, not SAMPLE-as-customer, not OpenAPI, not a runtime SPDX 2↔3 compatibility proof. `purchaseAuthority=false`. No network on the job path.
