# S03-cyclonedx-bom-schema result

Family `schemaWebhook`. Job `json-schema-webhook-drift` from useful-jobs **1.4.0**.

Tests: `NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs` → **11 pass, 0 fail**.

License at recorded SHAs: **Apache-2.0** (not CDDL). Official repo `CycloneDX/specification`.

## Pair A (assigned SHA pair, same filename)

`schema/bom-1.6.schema.json`

- before `80db0257f1182a2d4220b3a2ab6970f4bab824df`
- after `0bd48c88d1b1877c7a3536252e06893850763190`

File-level JSON diff is two annotation strings: `plan text` → `plain text` on `/definitions/attachment/properties/contentType/description`, and `staring` → `starting` on `/definitions/refType/$comment`. `/required` stays `["bomFormat","specVersion"]`.

**Engine:** status `informational`, unchangedCount 6, summary “No structural used-path drift.” Valid for instance-set used pointers. Not a fake delta.

**Witness (literal JSON at used pointers):** those two annotation pointers plus the parent `contentType` object **changed**; `/required`, `/definitions/refType/type`, `/definitions/refType/minLength` **unchanged**.

Engine vs witness disagreement on annotation/literal nodes is recorded in `regression-artifact.json`. Engine was not modified.

## Pair B (official tags, different filenames)

- 1.5 tag `c320fc0f0b46873864927d9d5684eea7ba439728` path `schema/bom-1.5.schema.json`
- 1.6 tag `55343ba19dee1785acf1ce9191540d5fd7b590db` path `schema/bom-1.6.schema.json`

**Engine:** status `actionable`

- compatible `enum-weakened` at `/definitions/component/properties/type` (`cryptographic-asset` added)
- added `/properties/declarations`
- added `/definitions/component/properties/cryptoProperties`
- 3 unchanged (`/definitions/component/required` stays `["type","name"]`; contentType; refType type)

**Witness agrees** on that structural used-pointer set.

BOM-root `/required` drops `version` in 1.6. That is a compatible required-removal proven from the files. It is **not** a breaking required-field add and was not claimed as one.

## Controls / negatives

- Identical before=after → informational, all used pointers unchanged
- 1.5 vs 1.6 with only unchanged used pointers → informational
- OpenAPI → `not-this-job-openapi`
- Remote `$ref` → `remote-ref-refused`
- `yarn.lock` → `not-json`
- Missing `--used` → `missing-required-inputs`
- Live URL as `--before` → `unreadable-input` (no fetch)

Receiving integration owner: **H6D-parent** catalog + `bin/select-job.mjs`. No purchase, customer, or live-fetch claims.
