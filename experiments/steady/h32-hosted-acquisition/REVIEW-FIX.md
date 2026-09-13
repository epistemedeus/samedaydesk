# H32 review fix — A1 / A2 / A3

Direct Cursor Grok 4.6 correction on Cloud D. No new Heavy parent. Prior reports (`RESULT.md`, `ROOT-ABORT-CONTROL.md`, `AMENDMENT-RESULT.md`) are unchanged. Parent product `c06c3e5`; report `b48e4d4`. Native session `e42464bb-…` stayed closed.

Sol Pro advisory was read from disk (Pilot PR179 `d840ece7…`); Root ranking outranks it. No tests were claimed by that advisory.

## Runtime

| Item | Value |
| --- | --- |
| CWD | `/tmp/h27/wt` |
| Branch | `codex/h27-artifact-retrieval-20260913` |
| Node | v22.22.2 |
| PostgreSQL | 16 isolated `initdb`/`pg_ctl` |
| Heap / concurrency | `NODE_OPTIONS=--max-old-space-size=768`, `--test-concurrency=1` |
| Replay TMPDIR | `/tmp/h27/runtime-tmp` |

## Map

| ID | Product | Evidence | Limitation |
| --- | --- | --- | --- |
| **H32-A1** | `ticket.mjs` `updateTicketAfterPost` always hashes `publicationFieldsFromBody`; never pins a claimed-only hash. `verify.mjs` recomputes unconditionally, requires any supplied hash to equal the derived hash, then compares derived vs ticket pin. | Projection: mutated tuples + `outputsDigest` with old `publicationIdentitySha256` → `publication-identity-mismatch`. CLI metadata fetch through a mutating GET proxy refuses the same envelope. | Metadata-only. Artifact acquire already recomputed the pin (`assertCompletePublicationManifest`). |
| **H32-A2** | Abort controller is created **before** response admission. Semaphore timer calls `onTimeout` (abort HA1 with `code: timeout`), then `res.destroy()` only if `!writableFinished && !destroyed`. Permit releases on `finish`/`close` only — not inside the timer, not via `writableEnded`. | `acquisition-http.test.mjs`: `responseTimeoutMs: 40`, `openTimeoutMs: 2000`, hold `beforeOpen` after HA1 admit, client stays connected; reader aborts, gate `0+0`, semaphore 0 after close, follow-up GET 200, execute/pay/outbox unchanged. | New **server-timeout** path. Does not reopen the falsified client-disconnect leak. |
| **H32-A3** | No product redesign. HTTP still publishes before writing the POST reply. | New test: real `http-consumer.mjs submit` against a loopback proxy that reads the upstream 200 **after** HA1 commit then `destroy()`s the downstream socket; file store/service restart; CLI `fetch --acquire-to` succeeds; execute/pay/outbox unchanged. Prior composition case retitled to “pre-POST ticket survives an unpersisted successful response”. | Proxy is loopback-only. Ticket `origin` is rewritten after restart because the host port is ephemeral. |

Client-disconnect controls (`destroy` / `resetAndDestroy` / `end`) remain. `res.on("close")` abort listener was not rewritten for that hypothesis.

## TAP (this HEAD, Node v22.22.2)

Combined HA1+HA2+HA3+projection+composition+H21 skeleton:

`# tests 76` `# pass 66` `# fail 0` `# skipped 0` `# todo 10`

H21 skeleton remains **10 TODO**, excluded from pass. No skip. Delta vs `c06c3e5` combined (`73/63/10`): **+3 passing tests** (server-timer, CLI lost-reply, CLI mutated metadata). Projection still 2 tests (A1 assertion added inside the envelope test).

Separate (not in the 76): D14 unit/local/transport `# tests 20` `# pass 20`; HA1 interrupt+hygiene `# tests 4` `# pass 4`.

## Not in this fix

Production TLS, JWKS/session principal, argv-free credentials, Hostinger, public catalog, payment. Bounded loopback only.
