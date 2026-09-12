# h04-ap-schema-openapi-yaml — OpenAPI 3 YAML is not this job

Label: **synthetic-mechanism**. Caller-owned tiny OpenAPI 3.0.3 YAML pair. Not copied from `tools/json-schema-webhook-drift/fixtures/openapi-refuse` (that fixture is JSON OpenAPI).

Documents start with `---` then `openapi: 3.0.3`. `info.title` is "Quay crane telemetry". Before: GET `/v1/cranes/{craneId}/load`. After: same GET plus POST, `info.version` 0.2.0 → 0.3.0.

`json-schema-webhook-drift` has no YAML parser and is not `api-upgrade-brief`. YAML must refuse `not-json`. If a caller ever handed equivalent JSON OpenAPI, the job must refuse `not-this-job-openapi`. Either way this case must **never** be treated as JSON Schema analysis success (no `kind: json-schema`, no used-path breaking/compatible brief).

`used.json` is still supplied so the CLI has a complete `--used` argument; the refuse happens at parse/kind, before used-path compare.
