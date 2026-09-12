# h04-ap-unsup-openapi-json

Synthetic caller OpenAPI **JSON** (not a public revision pair, not W4 SAMPLE, not YAML).

```json
{ "openapi": "3.0.3", "paths": {} }
```

M01 `json-schema-webhook-drift` (`tools/json-schema-webhook-drift/lib/kind.mjs`) returns `openapi` when `doc.openapi` is a string. `assertComparableKind` then throws `not-this-job-openapi`.

Contrast: YAML OpenAPI (h04-route-02 SDS52 probe) is refused as `not-json` because this engine has no YAML parser. This case is JSON so the OpenAPI kind check actually fires.

`--used` is required by the catalog argv even though used paths are never compared after the refuse.
