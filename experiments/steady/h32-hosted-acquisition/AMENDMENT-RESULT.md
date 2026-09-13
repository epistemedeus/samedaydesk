# H32 amendment — coherent D14 submit → HA1 publication → hosted fetch

Native Grok Heavy (`grok-4.6`, effort `xhigh`). `--resume e42464bb-4447-4207-8871-5352a264a06f` only. Hostname `cursor` is not provider identity. Auth `LOCATION=/home/ubuntu/.grok/auth.json`, grok.com OIDC logged-in. Controller `bc-ec55ab26-6e23-4562-9c7a-649331bdba1f` is mechanical only. Cash $0. No API-key billing, `--restore-code`, `--fork-session`, main merge, deploy, live charge, or public 1.4.7 rewrite.

Sol Pro `INPUT-H32-SOL-PRO.md` was read from disk as an untrusted advisory. Root instructions outrank it. Original abort-leak suspicion remains **falsified**; product `res.close` listeners were not rewritten.

## Runtime

| Item | Value |
| --- | --- |
| CWD | `/tmp/h27/wt` |
| Branch | `codex/h27-artifact-retrieval-20260913` |
| Parent (tests-only abort retention) | `1e0d70572c2ed54cc9a19082914d64335673fcd1` |
| Product HEAD | `c06c3e56ed1d530a23aeb1d3022640600ce3d5de` |
| argv | `grok --resume e42464bb-4447-4207-8871-5352a264a06f -m grok-4.6 --effort xhigh --cwd /tmp/h27/wt` |
| Node | v22.22.2 |
| PostgreSQL | 16 isolated `initdb`/`pg_ctl`, unused port, teardown |
| Native terminal | this parent session |
| Replay TMPDIR | `/tmp/h27/runtime-tmp` |
| NODE_OPTIONS | `--max-old-space-size=768` |
| test-concurrency | 1 |

Original [RESULT.md](./RESULT.md) TAP and [ROOT-ABORT-CONTROL.md](./ROOT-ABORT-CONTROL.md) are preserved.

## What this amendment proves

Authenticated D14 `submit` (original CLI ticket path) → HA1 `admit`/`publishCompleted` on the **same** store with one awaited synthetic principal → store/service restart → D14 `fetch --acquire-to` into a **second directory**. Not a handcrafted-ticket download.

Both HA1 jobs, JSON without a terminal newline, multibyte UTF-8 (`café 日本語 🎵`), successful POST pin, dropped POST reply, file restart, and real PostgreSQL restart were executed with the in-tree engines.

## Shared projections

| Schema | Role |
| --- | --- |
| `samedaydesk.acquisition-materialized-input.v1` | Source bytes/sha256 are audit-only. Acquisition `samedaydesk.acquisition-frozen-request.v1` hashes **materialized** tuples (HTTP JSON terminal-newline rule). Ambiguous `sha256 \|\| stagedSha256` at read time is gone. |
| `samedaydesk.acquisition-publication-identity.v1` | `executionId + jobId + requestHash/version + receiptSha256 + outputsDigest + exact sorted output tuples`. Cross-envelope pin. Raw POST `bodySha256` remains endpoint-specific audit. |

Process-local GET without `X-Request-SHA256` still falls through. `--local-artifacts` remains. GET still cannot execute, settle, enqueue, ack, or pay.

## Per-finding dispositions

| ID | Disposition |
| --- | --- |
| **H32-1** | **Fixed.** Reproduced on `1e0d705`: no-newline JSON, both jobs, multibyte: D14 ticket bound **raw** sha256; writer materialized hash differed. Shared `materializeHttpJsonText` + ticket/writer/POST now bind only materialized tuples. Source identity kept on the ticket row. |
| **H32-2** | **Fixed.** Reproduced: POST envelope hash ≠ HA2 GET hash; `verifyTicketBoundResult` failed `post-identity-mismatch` plus `input-missing`. POST publishes through HA1 and returns `publicationIdentityV1`. Verifier compares that pin on hosted GET; legacy process-local envelopes still use `bodySha256`. |
| **H32-3** | **Fixed.** `getArtifact` uses the same bounded stream reader as JSON (`readBytesBounded`), cancels on the first chunk past the limit, and acquire passes the committed `listed.bytes` as the ceiling. Chunked oversize without `Content-Length` returns `response-too-large` with `bytes: null`. |
| **H32-4** | **Fixed as a distinct HTTP response semaphore.** HA1 file-read gate unchanged. Semaphore held from admission through `finish`/`close`, with a response timer and chunked write/backpressure. Genuine paused sockets (raw TCP, headers then `pause`) refuse a second artifact with 503 while the permit is held. In-flight disconnect tests from `1e0d705` retained; **no** speculative `res.close` listener rewrite. Pre-aborted `fetch` remains a labelled local-reject case. |
| **H32-5** | **Fixed.** CLI passes the already-verified GET body into `acquireHttpArtifacts({ manifest })`; no second metadata GET. Manifest requires request hash/version, receipt hash, outputs digest, exact two tuples, and `publicationIdentitySha256`. Substitution and omitted fields refuse. |
| **H32-6** | **Loopback principal done; production remains next gate.** Same awaited `createStaticPrincipalAdapter` on POST and GET (raw bearer is not identity). Production JWKS/TLS/Hostinger/catalog/argv-secret hygiene are **not** claimed. Cleartext HTTP outside numeric loopback, capability-file modes, and provider credentials stay documented next work. Ticket files now use `0700`/`0600` as a private working-directory default only. |
| **H32-7** | **Causal ops added or titles narrowed.** Composition test is the real submit path. Hosted happy path retitled as pre-published reader. Lost-reply GET retitled (pending admission is not HTTP-queried). Expiry now **reopens** the file store. HA2 mismatch title no longer claims receipt/output substitution (that is on the D14 ticket path). Traversal title matches the request list; raw `%00` is also sent. PG `SHOW statement_timeout` plus `pg_sleep` cancellation are executed. |
| **H32-8** | **Fixed.** Postgres store uses a `pg.Pool` and `AsyncLocalStorage` leased client per transaction; nested `withAcquisitionLock` callbacks reuse that client. Same-store concurrent `admitAndPublish` plus observed `statement_timeout` are tested. No parallel store. |

## TAP (clean-source replay on `c06c3e5`)

Combined HA1+HA2+HA3+composition+projection+skeleton:

`# tests 73` `# pass 63` `# fail 0` `# skipped 0` `# todo 10`

| Pack | Pass | Fail | Todo |
| --- | --- | --- | --- |
| HA1 acquisition (file/hostile/known-bad/hooks/timeout/postgres) | 40 | 0 | 0 |
| HA2 `acquisition-http.test.mjs` | **10** | 0 | 0 |
| HA2 `acquisition-http-postgres.test.mjs` | 1 | 0 | 0 |
| HA3 `acquisition-hosted.test.mjs` (pre-published reader; titles narrowed) | 6 | 0 | 0 |
| H32 projection | 2 | 0 | 0 |
| H32 composition (file + PG, both jobs, dropped reply, negatives) | 4 | 0 | 0 |
| H21 skeleton (excluded from pass) | 0 | 0 | **10** |
| Existing D14 unit/local/transport (separate run) | 20 | 0 | 0 |
| HA1 interrupt + hygiene (separate) | 4 | 0 | 0 |

Delta versus abort-retention combined (`# tests 65` `# pass 55` `# todo 10`): **+8 passing tests** (pause semaphore, two projection, four composition, one same-store PG lease/timeout). Skeleton TODOs unchanged. No TODO-to-pass conversion.

GET execution/payment/outbox spies remain zero on retrieval. `purchaseAuthority` and `sold` stay false.

## Limits exercised

| Limit | Value |
| --- | --- |
| Per-file artifact | 1,048,576 bytes (pause test uses this bound) |
| Total artifacts | 2,097,152 |
| HTTP JSON body | 8 MiB |
| HA1 concurrent reads (composition) | 4 |
| HTTP active responses (pause negative) | 1 |
| Response timeout (pause negative) | 800 ms |
| Postgres `statement_timeout` (lease test) | 500 ms, `SHOW` + `pg_sleep(2)` → `57014` |
| Open timeout (HA2 HTTP) | 2,000 ms (disconnect bound 400 ms) |

## Known hosted-deployment step (not performed)

Production identity (Supabase JWKS / real users), TLS origin, Hostinger bind, public catalog advertisement of artifact GET, argv-free credentials, and live merchant/payment authority are **not** done. This amendment is private loopback composition over repaired HA1, not a hosted production claim.

## Compare

https://github.com/epistemedeus/samedaydesk/compare/codex/h21-package-release-gate-20260913...codex/h27-artifact-retrieval-20260913
