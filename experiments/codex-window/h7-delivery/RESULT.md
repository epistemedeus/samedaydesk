# H7-DELIVERY result

Native Grok Heavy (`grok-4.6`, effort xhigh) on Cursor Cloud VM. Hostname `cursor` is not provider identity. Subscription grok.com auth only. Cash $0. H6D session `01a09456-c82b-7b41-ad58-e5557da52ed3` was not resumed.

## Exact dependencies consumed

| Item | Value |
| --- | --- |
| Repo | `epistemedeus/samedaydesk` |
| Feature branch | `codex/h7-delivery-20260912` |
| Runtime pin | `6007fcfa27074f9a594248e47296f1afa4f8385d` (useful-jobs **1.4.3**) |
| Pin branch | `codex/vendor-temp-lifecycle-20260912` |
| Based on | `30345f69f16aca93bb95511ee4da62975c98cc04` |
| Start HEAD (import only) | `fe8057f395bc665b629e12dbff0db0c264f0eb46` |
| Execution contract | `samedaydesk.paid-useful-jobs.execution.v1` |
| Public catalog | `client/public/for-agents/useful-jobs/catalog.json` version **1.4.3** |
| Legacy wrapper extract | useful-jobs **1.0.0** archive `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` / 2,522,418 bytes |
| M01 / lockfile-pin-delta | in-tree source-identity pin (not forced equal to the 1.0.0 archive) |
| Node | v22.22.2 |
| Grok CLI | `/home/ubuntu/.grok/bin/grok` 1.0.25 |
| Protected trees vs pin | `server/paid-useful-jobs`, `tools/result-mailbox`, `tools/job-output-atomicity`, `tools/lockfile-pin-delta`, `experiments/wave5/m01`, `client/public/for-agents/useful-jobs` **unchanged** |
| CW64 | read-only (`tools/python-useful-jobs-client/` not edited) |
| Old package archives | immutable |
| Core runtime / release builder / CW63 / H6D | not edited |

Envelope `executionId` is **top-level**. `receipt.v1` may omit nested `executionId`. `fileEntry()` rows include absolute `path` and omit `kind`. Named-byte projection is `name` / `kind` (default file) / `bytes` / `sha256`. HTTP `POST /execute` + `GET /results/:id` has **no artifact download route**. HTTP `path` is not acquisition authority.

## Tests (honest)

All invocations used `NODE_OPTIONS=--max-old-space-size=768`, `--test-concurrency=1`, flock on `/tmp/h7/runtime-tmp/test.lock`, assignment TMPDIR under `/tmp/h7/runtime-tmp`. Ephemeral loopback HTTP. Assertions were not rewritten to hide defects.

| Slice | Command / pack | Pass | Fail | Skip | Notes |
| --- | --- | --- | --- | --- | --- |
| CW60 | `.../cw60.../test/boundaries.test.mjs` | 18 | 0 | 0 | TAP `evidence/h7-boundaries-after.tap` |
| CW60 | `.../cw60.../test/journey.test.mjs` | 14 | 0 | 0 | TAP `evidence/h7-journey-after.tap`; cold receipt `evidence/h7-20260912-native/cold-journey.json` |
| CW60 | named repro before repair | 0 | 2 | 0 | preserved `evidence/h7-repro-before.tap` |
| CW61 | consumer-regressions | 6 | 0 | 0 | |
| CW61 | binder tests | 25 | 0 | 0 | inherited sample is **analysis-partial** (unit spelling); clean-units **actionable** |
| CW61 | output-replay-harness | 21 | 0 | 0 | |
| CW61 | current-wrapper | 19 | 0 | 0 | includes capture + added-row `no-budget-delta` **witness** (not readiness) |
| CW62 | acceptance.test.mjs | 25 | 0 | 0 | TAP `evidence/acceptance.tap` |
| CW62 | desk replay-honesty | 6 | 0 | 0 | ported execute-seam safety |
| CW65 | controls | 9 | 0 | 0 | readinessCredit 0 |
| CW65 | current-core `--only` cases | 16 pass | 2 fail | 3 incomplete | see witnesses below; `--only` never sets `ready` |
| CW70 | foundation red specs | 5 | 0 | 0 | repaired client, not assertions |
| CW70 | combined owned tests | 36 | 0 | 0 | includes foundation + current-runtime HTTP |
| H7 | `h7-delivery/test/cold-journey.test.mjs` | 1 | 0 | 0 | chained freeze→execute→export/ack→replay/batch→HTTP |

PG **55590 / 55591 / 55592 / 55595**: **untested** (no executed case required a cluster).

Donor package suites that still assume old CLI pins, `f08Root` overrides, or git-fetched D01 were **not** bulk-run as current acceptance.

## Actual experiments

1. **CW60 delivery-export.** Receiver compared whole `receipt.outputs` (absolute `path`, no `kind`) to `outputRefs()` payload rows. Fixed by named-output projection (exact name/kind/bytes/sha256). Partial-receipt export mapped `MailboxError` → `ExportRefuse` exit 2 without editing mailbox. Cold lockfile-pin-delta wrapper → mailbox pickup → export → independent receiver commit-before-ack → replay. M01 source-identity kept distinct from 1.0.0 archive identity.

2. **CW61 repeat/replay.** Two inherited catalog tests expected `actionable` on `samples/pricing/a` after mutating `gpt-4.1-input`. Independent analysis of that sample is **partial** (`USD/1M-Tokens` vs `USD/1M-tokens` on grok-4.6-input). Status mapping was not reversed. New clean-units control is `actionable`. Durable `.replay-capture/` + `wrapper-process.json` per run including refusal of run A. Legacy added-row `no-budget-delta` is a witnessed engine semantic defect, not readiness.

3. **CW62 batch/value.** Harness import root was five `../` segments; test dir is four levels down. Rebound `CURRENT_CORE_BASE` to `6007fcfa`. Named-byte projection; M01 vs 1.0.0 archive identity branched. Desk→batch→value library and HTTP, kill/restart, interrupted batch, concurrent writers, substitutions, value event replay. `usefulPaidWork` remains false.

4. **CW70 cold HTTP consumer.** Ticket persists caller `executionId` before POST. Incomplete HTTP 200 `ok:true` is not analysis success. Redirects `error`. Foreign-origin retrieval refused. **`unsupported-portable-acquisition`** when only host paths exist. Explicit `fetch --local-artifacts DIR --acquire-to DIR`. In-tree `serve-execution.mjs` only; spawn-d01 git-fetch fallback removed. `httpArtifactsDelivered` stays false.

5. **CW65 independent harness countercheck.** Oracle no longer requires nested `receipt.executionId`. Pickup uses `outDir` + basename. `--only` cannot grant global readiness. Two **runtime witnesses** preserved (not rewritten, core not edited):
   - `d20-order-interrupt-before-complete`: reopen ran a second real engine (`executions.jsonl` 1→2, distinct execution IDs).
   - `d18-publication-rollback`: refused publication still overwrote a preexisting caller artifact.

6. **H7 chained cold journey.** `experiments/codex-window/h7-delivery/test/cold-journey.test.mjs` plus `evidence/cold-current-runtime-journey.json`: lockfile-pin-delta freeze/execute/export/outbox, vendor replay, two-row batch/value (`usefulPaidWork: false`), HTTP ticket `h7-cold-http` with portable unsupported then local acquire.

## Unsupported boundaries

- HTTP has no artifact download route; portable acquisition is `unsupported-portable-acquisition`.
- HTTP `path` is not acquisition authority.
- Process-local execution cache is not durable across server restart; same-ID replay is not exactly-once recovery.
- GET does not prove caller payment/accepted terms or frozen request hash.
- Directory / rewritten job-document inputs remain `unbound-input-shape` in desk/replay.
- No authenticated HTTP principal (CW65 incomplete gate).
- No live payment, no sale, callback ack is not buyer acceptance.
- Postgres lanes untested.
- Multi-host / hostile filesystem / power-loss durability not claimed.
- Hosted transfer to an independent external customer not claimed (receiver still uses an operator-provided bundle dir).
- CW65 ledger/outbox cases remain incomplete independent gates (sibling slices exist; that is not CW65 acceptance).
- Child count is not product acceptance.

## Next integration owner

**Grok Heavy integration reviewer**, then the **vendor/runtime owner** for the two preserved CW65 witnesses (`managed-useful-jobs-order` second engine run after before-complete interrupt; wrapper publication overwrite on failed second copy). Do not edit those cores from this consumer charter.

Optional later: dedicated PG 55590/55591/55592/55595; CW64 pin refresh against a future shipped archive (this client remains 1.4.1 packaged); consolidating CW39 zipapp vs D08 Python entry.

## Git / PR

Branch tip: `7e540d1f30efd9841ba107ecaa7269562fe8560e` on `codex/h7-delivery-20260912` (import `fe8057f` plus seven implementation/stamp commits).

Draft PR via `gh pr create` returned GraphQL **Resource not accessible by integration** (`createPullRequest`). Compare URL (review this, not a silent `main` merge):

https://github.com/epistemedeus/samedaydesk/compare/6007fcfa27074f9a594248e47296f1afa4f8385d...codex/h7-delivery-20260912

Pin-branch compare:

https://github.com/epistemedeus/samedaydesk/compare/codex/vendor-temp-lifecycle-20260912...codex/h7-delivery-20260912
