# h04-ap-schema-false — boolean `items` true → false

Label: **synthetic-mechanism**. Caller-owned JSON Schema pair. Not a public revision. Not copied from `tools/json-schema-webhook-drift/fixtures`, `experiments/wave5/m01/fixtures/schema`, or `examples/schema-webhook/h04-schema-01`.

Harbor **quay lane ticket** schema. Used pointer `/properties/laneMarks` is an array schema whose `items` keyword is the boolean schema `true` (any item allowed) in `before.json` and the boolean schema `false` (no item allowed) in `after.json`.

Instance-set reading (independent of engine stdout): every previously valid non-empty `laneMarks` array becomes invalid. That is a tightening of a used boolean schema. JSON Schema treats boolean `true`/`false` as schemas; this is not an `additionalProperties` keyword rank change.

Unused: `/properties/stewardNote/description` wording changes; root `additionalProperties` stays `true`. Those must not be the used-path finding.

Expected useful output: analysis (not refuse). Likely `actionable` / breaking `boolean-schema-tightened`.
