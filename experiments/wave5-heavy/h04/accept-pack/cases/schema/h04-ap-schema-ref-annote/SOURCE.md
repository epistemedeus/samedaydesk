# h04-ap-schema-ref-annote — `$ref` annotation-only siblings

Label: **synthetic-mechanism**. Caller-owned JSON Schema pair. Control for `h04-ap-schema-ref-sib`. Not copied from engine `ref-sibling-description`.

**Berth code via `$ref`**. Used pointer `/properties/berthCode` keeps `$ref: "#/$defs/BerthCode"` and an identical target (`type` string, `minLength` 3, `maxLength` 12). After adds/rewrites `description` and `title` beside `$ref`. Those keywords are annotations; they do not change the instance set.

Unused: `/properties/radioChannel/description` wording only.

Expected useful output: analysis (not refuse) that is a **useful no-change**: instance set unchanged. Must not be reported as breaking `$ref` drift.
