# H32 — HA2 HTTP then HA3 D14 over repaired HA1

Native Grok Heavy (`grok-4.6`, effort `xhigh`). `--resume e42464bb-4447-4207-8871-5352a264a06f`. Hostname `cursor` is not provider identity. Auth `LOCATION=/home/ubuntu/.grok/auth.json`, logged-in true. Cash $0. `purchaseAuthority: false`. No main merge, deploy, live charge, or public 1.4.7 rewrite.

## Runtime

| Item | Value |
| --- | --- |
| CWD | `/tmp/h27/wt` |
| Branch | `codex/h27-artifact-retrieval-20260913` |
| Parent HEAD | `16f8fd0b61393da5506ee1b02965d9d41e6c3c51` |
| argv | `grok --resume e42464bb-4447-4207-8871-5352a264a06f -m grok-4.6 --effort xhigh` |
| Node | v22.22.2 |
| PostgreSQL | 16 isolated `initdb`/`pg_ctl`, unused port, teardown |

H21 plan, declaration, ten skeleton obligations, HA1 `RESULT.md` / `HA2-HANDOFF.md`, and in-tree HTTP/D14 were read first. Not a new scaffold.

## What shipped

One loopback HTTP service: injected HA1 reader + trusted principal adapter (token → stable principal; raw Authorization is not an identity). GET `/results/:id` + `/results/:id/artifacts/:name` with `X-Request-SHA256` / `X-Artifact-SHA256`. D14 persists `requestHash` on the ticket before POST, then downloads the two promised files into a **second directory** with no shared host path. `--local-artifacts` remains. Fetch never POSTs, settles, or pays.

| Surface | Path |
| --- | --- |
| HA2 | `server/paid-useful-jobs/lib/acquisition-http.mjs`, `lib/http.mjs`, `bin/serve-execution.mjs`, `tests/acquisition-http*.test.mjs` |
| HA3 | `experiments/wave5/d14/lib/{acquire,client,origin,ticket,verify}.mjs`, `bin/http-consumer.mjs`, `test/acquisition-hosted.test.mjs` |
| HA1 small | finite `maxQueuedReads`; Postgres `statement_timeout` |

## Ten skeleton obligations

Executed as real tests in HA2/HA3 (not by deleting H21 TODOs). H21 `hosted-acquisition.skeleton.test.mjs` remains **10 TODO** design scaffolding and is **not** counted as a pass.

## TAP

Combined HA1+HA2+HA3+skeleton (native H32 close):

`# tests 63` `# pass 53` `# fail 0` `# skipped 0` `# todo 10`

| Pack | Pass | Fail | Todo |
| --- | --- | --- | --- |
| HA1 acquisition (file/hostile/known-bad/hooks/timeout/postgres) | 39 | 0 | 0 |
| HA2 `acquisition-http.test.mjs` | 7 | 0 | 0 |
| HA2 `acquisition-http-postgres.test.mjs` | 1 | 0 | 0 |
| HA3 `acquisition-hosted.test.mjs` | 6 | 0 | 0 |
| H21 skeleton | 0 | 0 | **10** |
| Existing D14 unit/local (separate run) | 15 | 0 | 0 |
| HA1 interrupt + hygiene (separate) | 4 | 0 | 0 |

Known-bad: process-local Map without a durable reader still has no artifact route. Missing hosted ticket hash still reports `unsupported-portable-acquisition`.

## Root abort-control retention (not a product fix)

In-flight loopback disconnect on original `e1ec5c6` **falsified** a leaked-reader leak: `req.aborted` aborted the held `beforeOpen` in 12ms, permits `0+0`, follow-up GET 200 (`destroy` / `resetAndDestroy` / `end`). Node v22.22.2. Full receipt: [ROOT-ABORT-CONTROL.md](./ROOT-ABORT-CONTROL.md).

Controller retained that experiment as HA2 tests only. No `acquisition-http.mjs` listener change. Pre-aborted `fetch` remains a separate labelled case (local reject, not in-flight proof).

Combined replay after test retention (this VM):

`# tests 65` `# pass 55` `# fail 0` `# skipped 0` `# todo 10`

| Pack | Pass | Fail | Todo |
| --- | --- | --- | --- |
| HA1 acquisition | 39 | 0 | 0 |
| HA2 `acquisition-http.test.mjs` | **9** | 0 | 0 |
| HA2 postgres | 1 | 0 | 0 |
| HA3 hosted | 6 | 0 | 0 |
| H21 skeleton (excluded from pass) | 0 | 0 | **10** |

## Known hosted-deployment step (not performed)

Production identity (Supabase JWKS / real users), TLS origin, Hostinger bind, public catalog advertisement of artifact GET, and live merchant/payment authority are **not** done. This is loopback integration over repaired HA1, not a hosted production claim.

## Compare

https://github.com/epistemedeus/samedaydesk/compare/codex/h21-package-release-gate-20260913...codex/h27-artifact-retrieval-20260913
