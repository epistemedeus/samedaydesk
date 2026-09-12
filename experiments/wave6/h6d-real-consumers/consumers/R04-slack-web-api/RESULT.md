# R04 Slack Web API — result

Status: **complete**. Tests: **14 pass / 0 fail**.

`NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`

## Source

Official `slackapi/slack-api-specs` `web-api/slack_web_openapi_v2.json`, MIT.

Walked commits on that path. Pair:

- before `3f1e8b4a03855cb29cffbfcaf60195e5867780ea` (2020-04-03, spec 1.5.0, 1360907 bytes, sha256 `b026c31dddfe96d9ff2d32832c0c18538eb9c94db66c824c8bcbac546032e856`)
- after `dfea73e06d146c368d7f94b52ac90796dc4e27e1` (2020-10-06, spec 1.7.0, 1237332 bytes, sha256 `742a5c977180a829df8767cf57bc417d99b3713583aee83741efb9c08ca731e7`)

Not OpenAI. Not octokit `organization.renamed`. Full blobs not stored.

Independent method+path set on the official files: **+32 / −43 / 142 unchanged**. Stable in both: `POST /chat.postMessage`, `GET /users.info`, `GET /conversations.list`. Real delta includes added `POST /conversations.mark` and removed `GET /channels.list`.

## Engine vs witness

useful-jobs **1.4.0** `api-upgrade-brief` **accepted** swagger 2.0 JSON excerpts (not refused). No `regression-artifact.json`.

Positive used-ops pin (eight methods): engine `actionable`, `Used-ops delta: +3/~0/-2`. Witness `openapi-method-path` agrees:

- retire `GET /channels.list`, `GET /channels.info`
- consider `POST /conversations.mark`, `POST /admin.conversations.create`, `POST /calls.add`
- unchanged `POST /chat.postMessage`, `GET /users.info`, `GET /conversations.list`

Control unused-pointer (`used-control.json`, the three stable methods only): engine `informational` / `no-used-op-delta`. Witness added=removed=changed=0.

Engine compared **bounded excerpts**, not the 1.2 MiB official documents. Witness on the official pair uses stored method+path indexes of those full blobs.

## SDS projection (non-equivalent)

OpenAPI path+method is not SDS `{path, canonical, title}`. Caller-owned catalogs (`authority: caller`, `publishedRouteTable: false`) drop HTTP method. `route-table-diff` outcome `breaking` with the same three added paths and two removed paths. Identical SDS control is `no-change`.

Raw swagger to `route-table-diff` → `unsupported_catalog`. Live URL → `external_catalog_refused`. `--rewrite-homepage` → `homepage_rewrite_refused`. OpenAPI-as-schema to `json-schema-webhook-drift` → `not-this-job-openapi`.

## Honesty

No purchase, scheduler, live fetch, or customer claims. yarn.lock is not OpenAPI (witness `not-openapi`); `api-upgrade-brief` does not refuse it closed and must not be read as the Slack before snapshot.
