# h04-schema-01 — exclusiveMinimum type change

Primary source: [json-schema-org/json-schema-spec](https://github.com/json-schema-org/json-schema-spec) `schema.json` (the published JSON Schema **meta-schema**).

| Side | Tag | SHA | URL |
| --- | --- | --- | --- |
| before | `draft-fge-json-schema-validation-00` (Draft 04) | `d4c5b3a2924370c51b710c8bfd81d3644a92766e` | https://github.com/json-schema-org/json-schema-spec/blob/d4c5b3a2924370c51b710c8bfd81d3644a92766e/schema.json |
| after | `draft-wright-json-schema-01` (Draft 06) | `4b495a2933b1d6f75298abdd23f018ba6a9d4f4a` | https://github.com/json-schema-org/json-schema-spec/blob/4b495a2933b1d6f75298abdd23f018ba6a9d4f4a/schema.json |

Fact that changed: `/properties/exclusiveMinimum` went from `{ "type": "boolean", "default": false }` to `{ "type": "number" }`. Draft 04 treated the keyword as a boolean modifier of `minimum`; Draft 06 made it an independent numeric exclusive bound. A validator or code generator pinned to this used path must stop accepting `true`/`false`.

Unused in this job (must **not** be reported as the used-path finding): Draft 06 also added `const`/`contains`/`$id` and changed `exclusiveMaximum` the same way. Those pointers are outside `used.json`.

`before.json` / `after.json` are the published meta-schema documents (~4 KB each), not a copy of `tools/json-schema-webhook-drift/fixtures/*`. License: bounded excerpt of the public spec meta-schema (json-schema.org drafts; repo license NOASSERTION).
