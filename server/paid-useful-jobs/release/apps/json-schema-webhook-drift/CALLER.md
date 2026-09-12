# json-schema-webhook-drift - caller guide

Compare used JSON Pointers on two JSON Schema or webhook-example documents.
Not OpenAPI. Not `api-upgrade-brief`.

## Required inputs

| Flag | Meaning |
|------|---------|
| `--before` | Before JSON Schema / webhook example |
| `--after` | After JSON Schema / webhook example |
| `--used` | JSON `{ "pointers": ["/properties/…"] }` |

Optional: `--out-dir <dir>`.

## `--example` vs caller files

`--example` uses packaged SAMPLE fixtures. Caller files:
`samples/schema/h04-schema-01/{before,after,used}.json`.

## Honesty

OpenAPI documents refuse `not-this-job-openapi`. Remote `$ref` is refused.
Compatible weakening is analysis (exit 0), not a wrapper failure.
No network. `purchaseAuthority` is false.
