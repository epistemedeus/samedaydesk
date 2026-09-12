# R04 Slack Web API — official source

Not OpenAI. Not octokit `organization.renamed`. Not a useful-jobs SAMPLE pair.

## Repository

- GitHub: [slackapi/slack-api-specs](https://github.com/slackapi/slack-api-specs) (archived 2024-03-27, read-only)
- Path: `web-api/slack_web_openapi_v2.json`
- Dialect: OpenAPI 2.0 (`"swagger": "2.0"`), Slack Web API HTTP RPC methods
- License: **MIT** (`LICENSE` at HEAD of path; SPDX `MIT`). Copyright (c) 2017 SlackAPI.
- Default branch: `master`

## Two official SHAs (real method+path delta)

Walked GitHub commits on `web-api/slack_web_openapi_v2.json` (14 commits). Picked **HEAD of that path** vs the previous OpenAPI-changing commit:

| Role | Full SHA | Commit date | Message | Spec `info.version` |
|---|---|---|---|---|
| before | `3f1e8b4a03855cb29cffbfcaf60195e5867780ea` | 2020-04-03T18:05:46Z | bring in the updates | 1.5.0 |
| after | `dfea73e06d146c368d7f94b52ac90796dc4e27e1` | 2020-10-06T21:27:48Z | October 2020 spec updates | 1.7.0 |

October 2020 changelog: new admin methods; deprecated Conversations-API predecessors (`channels.*` / `groups.*` / `im.*` / `mpim.*`) removed from the spec.

Independent method+path counts on the **full official blobs**:

- before: 185 operations
- after: 174 operations
- added: 32 (includes `POST /conversations.mark`, `POST /admin.conversations.create`, `POST /calls.add`)
- removed: 43 (includes `GET /channels.list`, `GET /channels.info`)
- unchanged: 142, including `POST /chat.postMessage`, `GET /users.info`, `GET /conversations.list`

## Retrieval

- Method: GitHub REST `GET /repos/slackapi/slack-api-specs/commits?path=web-api/slack_web_openapi_v2.json`, contents API for git blob SHAs, then `raw.githubusercontent.com` GET of the two historical files + `LICENSE`. No unrelated-tree scrape.
- Retrieved at: `2026-09-12T06:55:52Z`

## Full-blob provenance (not stored)

Full official JSON is ~1.2–1.4 MiB. Stored sha256/bytes only.

| SHA | bytes | sha256 | git blob |
|---|---|---|---|
| `3f1e8b4a03855cb29cffbfcaf60195e5867780ea` | 1360907 | `b026c31dddfe96d9ff2d32832c0c18538eb9c94db66c824c8bcbac546032e856` | `0973bf2b89414e2e1a227752af15d863b3c9fc6a` |
| `dfea73e06d146c368d7f94b52ac90796dc4e27e1` | 1237332 | `742a5c977180a829df8767cf57bc417d99b3713583aee83741efb9c08ca731e7` | `72c5dfb431e05f5d6fa2aa28ebcd60d503a67886` |

LICENSE: 1065 bytes, sha256 `5fca42e1431e247c120ab9c787ff16a26a538633852821e4865d05fe4cfea98e`, git blob `4c4907b159ed25001dc9a217cd709dfdafd7e08b`.

Raw URLs:

- https://raw.githubusercontent.com/slackapi/slack-api-specs/3f1e8b4a03855cb29cffbfcaf60195e5867780ea/web-api/slack_web_openapi_v2.json
- https://raw.githubusercontent.com/slackapi/slack-api-specs/dfea73e06d146c368d7f94b52ac90796dc4e27e1/web-api/slack_web_openapi_v2.json

## Stored fixtures (bounded)

See `fixtures/provenance.json` for per-file sha256. Indexes of every method+path from the full blobs live in `fixtures/operations/{before,after,delta}.json`. Bounded swagger excerpts of eight used operations live in `fixtures/openapi/`. Caller-owned SDS projections (non-equivalent; method dropped) live in `fixtures/sds/`.

## Job

useful-jobs **1.4.0** `api-upgrade-brief` accepted these swagger 2.0 excerpts (not refused). Secondary labeled projection: `route-table-diff` on SDS `{path,canonical,title}` catalogs. OpenAPI path maps fed to `route-table-diff` refuse `unsupported_catalog`.
