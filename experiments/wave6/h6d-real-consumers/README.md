# H6D real useful-jobs consumers

Sixteen independent offline integrations that run **useful-jobs 1.4.0** on official
open-source revision pairs. Parent owns the catalog and job-selection CLI.
Each child owns one exclusive directory under `consumers/`.

No purchase authority. No live fetch. No scheduler daemon.

## Families

| Family | Count | useful-jobs id | Independent witness |
| --- | --- | --- | --- |
| lockfile | 4 | `lockfile-pin-delta` | npm lockfileVersion 2/3 name+version+integrity+resolved |
| schemaWebhook | 4 | `json-schema-webhook-drift` | used JSON Pointers on JSON Schema or webhook examples |
| apiRoutes | 4 | `api-upgrade-brief` and/or projected `route-table-diff` | OpenAPI/Swagger method+path; SDS projection is **not equivalent** |
| pageSnapshots | 4 | `page-change-offline-job` | selected fields on held `extract-batch.v0` |

## Kit pin

- `client/public/kit/useful-jobs-1.4.0.tar.gz`
- 2575215 bytes
- sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`

## CLI

```bash
NODE_OPTIONS=--max-old-space-size=768 node bin/select-job.mjs list
NODE_OPTIONS=--max-old-space-size=768 node bin/select-job.mjs list --family lockfile --json
NODE_OPTIONS=--max-old-space-size=768 node bin/select-job.mjs show L01-commander-lockfile
NODE_OPTIONS=--max-old-space-size=768 node bin/select-job.mjs migrations
NODE_OPTIONS=--max-old-space-size=768 node --test test/*.test.mjs
```

Unknown ids refuse closed. `migrations` documents non-equivalent projections
(OpenAPI→SDS route table, HTML→extract-batch, yarn→npm lock, OpenAPI-as-schema).

## Ownership

Write only `experiments/wave6/h6d-real-consumers/`. Engine source is read-only.
Engine misclassifications become `regression-artifact.json`, not engine patches.
