# h04-ap-schema-ref-sib — `$ref` constraint sibling `minLength`

Label: **synthetic-mechanism**. Caller-owned JSON Schema pair. Not copied from M01 `ref-before.json` / engine `ref-sibling-minimum` (those use `$defs.Amt` + sibling `minimum` / sibling `type`).

**Container seal code**. Used pointer `/properties/seal` is `{ "$ref": "#/$defs/HarborSealId", "minLength": 4 }` before and `minLength: 8` after. The `$ref` target `$defs/HarborSealId` is identical. Draft 2019-09 / 2020-12 apply adjacent keywords beside `$ref`.

Instance-set reading: strings of length 4–7 that matched the target become invalid. That is a tightened `minLength` sibling, not an ignored annotation.

Unused: `/properties/clerkInitials/description` wording only.

See `h04-ap-schema-ref-annote` for the annotation-only sibling control (description change, instance set unchanged).

Expected useful output: analysis (not refuse). Likely `actionable` / breaking `numeric-tightened`.
