# S01-jsonschema-recursive-anchor result

Status: **complete**. Tests: **9 pass / 0 fail**.

Job: useful-jobs 1.4.0 `json-schema-webhook-drift`  
Source: `json-schema-org/json-schema-spec` `schema.json`  
`63fbd7bf561a6ef04a38fd63589a3d93d1c149ff` (fix broken reference) → `c028e943ab213531f55e60ff6a2b1202f5d443c6` (fix the type for `$recursiveAnchor`).

## Fact

Verified JSON Pointer `/properties/$recursiveAnchor/type` is absent before and the string `"boolean"` after. The keyword object `/properties/$recursiveAnchor` exists in both revisions; its type axis changes from absent to `"boolean"` while a remote `$ref` (`meta/core#/$defs/anchorString`) is dropped.

Control pointers `/properties/$recursiveRef/type`, `/title`, and `/type` are unchanged. This is not the H04 `exclusiveMinimum` pair.

## Engine vs independent witness

| Pointer | Witness | Engine |
|---------|---------|--------|
| `/properties/$recursiveAnchor/type` | added | added, status `actionable` |
| `/properties/$recursiveRef/type`, `/title` | unchanged | unchangedCount 2 |
| `/properties/$recursiveAnchor` | changed (type axis) | **refused** `remote-ref-refused` |

`summarize()` still prints “No structural used-path drift” when the only used-path class is `added`. Classification and status are otherwise consistent with the type pointer. Engine bytes were not edited; see `regression-artifact.json`.

## License at SHA

README: AFL or BSD. No `LICENSE` file in either tree. The assignment hint Apache-2.0 OR BSD-3-Clause was not used.

## Tests

`NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`

- positive official type pointer
- control identical documents
- control unchanged used pointers
- negative OpenAPI → `not-this-job-openapi`
- negative remote `$ref` → `remote-ref-refused`
- keyword-object witness vs engine refuse
- summary regression still holds
- not H04 exclusiveMinimum
- missing `--used` refused

Receiving owner: H6D parent catalog + `bin/select-job.mjs`. `purchaseAuthority=false`.
