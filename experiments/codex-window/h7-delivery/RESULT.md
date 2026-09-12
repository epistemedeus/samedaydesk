# H7-DELIVERY result

Native Grok Heavy (`grok-4.6`, effort xhigh) on Cursor Cloud VM. Hostname `cursor` is not provider identity. Subscription grok.com auth only. Cash $0. H6D session `01a09456-c82b-7b41-ad58-e5557da52ed3` was not resumed.

## Exact dependencies consumed

| Item | Value |
| --- | --- |
| Repo | `epistemedeus/samedaydesk` |
| Feature branch | `codex/h7-delivery-20260912` (PR145) |
| Integration source | `c6f1464222169f2d32247c978dc5007d82a2aa03` (SDS PR146 into `codex/useful-jobs-core-integration-20260912`) |
| Repair SHA | `080cc62e7bc83f76431d916df34aea6d30875401` (publication rollback + interrupted-run guard; byte-identical trees to `c6f1464` for those files) |
| Archive pin (immutable 1.4.3) | `8a811bbadba7edc6c926b319b0839cd2f01e5896` |
| Pin fix (vendor-temp) | `e122c26657977ce3a2d41642095e999db1125b53` |
| Previous pin (ancestor, **not** release-ready) | `6007fcfa27074f9a594248e47296f1afa4f8385d` |
| Unpublished 1.4.3 archive | **2615491** bytes, sha256 `a18ab918b5a6f60a6981903694aeba41d7d30dd8ad3e336f1d7b8fd22cf62b09` — **does not contain wrapper publication/interrupt fixes**; not overwritten; no 1.4.4 packaged |
| Pin branch | `codex/useful-jobs-core-integration-20260912` (consumers previously stacked on vendor-temp `8a811bba`) |
| Based on | `30345f69f16aca93bb95511ee4da62975c98cc04` |
| Start HEAD (import only) | `fe8057f395bc665b629e12dbff0db0c264f0eb46` |
| Rebind merge | `559fa3b` (`8a811bba` into consumer branch; no donor-history rewrite) |
| Execution contract | `samedaydesk.paid-useful-jobs.execution.v1` |
| Public catalog | `client/public/for-agents/useful-jobs/catalog.json` version **1.4.3** |
| Legacy wrapper extract | useful-jobs **1.0.0** archive `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` / 2,522,418 bytes |
| M01 / lockfile-pin-delta | in-tree source-identity pin (not forced equal to the 1.0.0 archive) |
| Node | v22.22.2 |
| Grok CLI | `/home/ubuntu/.grok/bin/grok` 1.0.25 |
| Protected trees | `client/public/for-agents/useful-jobs` 1.4.3 archive blob still `f85c326…` / `a18ab918…` (same as `8a811bba`). Wrapper + `create-order.mjs` match `c6f1464`/`080cc62`. HTTP adapter gained process-local Authorization principal binding. |
| CW64 | read-only (`tools/python-useful-jobs-client/` not edited) |
| Old package archives | immutable |
| Core runtime / release builder / CW63 / H6D | not edited |

Envelope `executionId` is **top-level**. `receipt.v1` may omit nested `executionId`. `fileEntry()` rows include absolute `path` and omit `kind`. Named-byte projection is `name` / `kind` (default file) / `bytes` / `sha256`. HTTP `POST /execute` + `GET /results/:id` has **no artifact download route**. HTTP `path` is not acquisition authority. When `Authorization` is present on execute, GET `/results/:id` with a different principal is **403 `principal-mismatch`**. Unauthenticated existing clients are unchanged.

## PR145 rebind onto integration `c6f1464` (this turn)

Merged PR146 / `080cc62` into this consumer branch without rewriting consumer history. Compact receipt: `evidence/pr145-c6f1464-rebind.json`. Integration, **not** production.

**Known-bad control:** listing the 1.4.3 tarball shows `lib/common.mjs` and **no** `lib/wrapper.mjs`. Do not claim the immutable archive contains the newest wrapper fixes. Do not overwrite its bytes. No new packaged version was required (wrapper is in-tree source).

### Commands and counts

| Pack | Pass | Fail | Incomplete | Notes |
| --- | --- | --- | --- | --- |
| `vendor-temp-lifecycle.test.mjs` | 9 | 0 | 0 | PR143 leak correction still holds |
| `packaged-vendor-lifecycle.test.mjs` | 2 | 0 | 0 | packaged 1.4.3 vendor scratch, not wrapper |
| `publication-rollback.test.mjs` | 5 | 0 | 0 | Root's 5 publication cases |
| `interrupt-before-complete.test.mjs` | 1 | 0 | 0 | Root's interrupt guard |
| `concurrent-resume.test.mjs` | 2 | 0 | 0 | Root's concurrent resume |
| managed-order `postgres.test.mjs` port **55595** | 2 | 0 | 0 | real initdb/`pg` |
| buyer-value-ledger `postgres.test.mjs` | 1 | 0 | 0 | stamped `evidence.postgres=local-runtime` |
| outbox `postgres.test.mjs` | 1 | 0 | 0 | receiver now has required `--store-dir` |
| HTTP principal unit | 1 | 0 | 0 | 403 other-Bearer |
| CW65 `--only d18-publication-rollback` | 1 | 0 | 0 | `--only` EXIT 3, `ready:false`, `runtimeUnchanged` |
| CW65 `--only d20-order-interrupt-before-complete` | 1 | 0 | 0 | same |
| CW65 `--only d19-http-principal-boundary` | 1 | 0 | 0 | previously incomplete |
| CW65 `--only d19-current-ledger` | 1 | 0 | 0 | sibling ledger, `usefulPaidWork` false |
| CW65 `--only d20-current-outbox` | 1 | 0 | 0 | sibling outbox; ack ≠ buyer acceptance |
| CW70 current-runtime HTTP | 11 | 0 | 0 | portable unsupported + local acquire |
| H7 cold journey | 1 | 0 | 0 | pin `c6f1464`; archive pin `8a811bba` |

CW65 `--only` never grants global `ready`. Evidence under `cw65-delivery-adversarial-harness/evidence/h7-c6f1464-*`.

### What can ship independently vs what remains

**Can ship as integration (not production main):**
- PR143 vendor-temp leak correction (`8a811bba` / archive `a18ab918`)
- PR146 wrapper publication rollback + interrupted-run guard (`080cc62` / `c6f1464`)
- These two are independent of later consumer polish

**PR145 consumer rebind** is useful stacked integration: consumers preserved, pins name `c6f1464` as source and `8a811bba` as archive identity. **Do not default-merge.**

**Still cannot ship as production delivery / sale:**
- HTTP has no artifact download route; portable remains `unsupported-portable-acquisition` (honest) with explicit `--local-artifacts` / `--acquire-to`
- Process-local HTTP cache; restart does not recover IDs
- `usefulPaidWork` false; `sold`/`purchaseAuthority` false; callback ack is not buyer acceptance
- No live pay; cash $0
- Immutable 1.4.3 package still lacks wrapper source fixes (documented, not a 1.4.4)

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

### Rebind to `8a811bba` (this turn)

Cause: duplicate application signal-handler invocation. Merged pin head `8a811bba` (fix `e122c266`) onto the consumer branch without rewriting consumer commits and without merging unrelated donor histories. Unpublished 1.4.3 archive verified **2615491** bytes, sha256 `a18ab918…cf62b09`. Old `6007fcfa` archive is not release-ready (fails the four new signal tests). 28 prior released archive/pin files unchanged.

| Pack | Result |
| --- | --- |
| `server/paid-useful-jobs/tests/vendor-temp-lifecycle.test.mjs` | **9/9** (includes four application-handler-without-redelivery tests) |
| `server/paid-useful-jobs/tests/packaged-vendor-lifecycle.test.mjs` | **2/2** (nested 9/9 on extracted 1.4.3 + packaged CLI cancel) |
| H7 cold journey | **1/1** (receipt pin `8a811bba`) |
| CW60 journey | **14/14** |
| CW62 acceptance | **25/25** (consumed pin assertion is `8a811bba`) |
| CW70 foundation + current-runtime + D14 | **36/36** |
| CW61 frozen-refs (partial+clean-units) | **2/2** |
| CW61 current-wrapper | **19/19** |
| CW65 `--only d16-current-vendor` | pass, `runtimeUnchanged: true`, `ready: false` (`evidence/h7-pin-8a811bba-vendor-001`) |

PG **55590 / 55591 / 55592 / 55595**: **untested** (no executed case required a cluster).

Donor package suites that still assume old CLI pins, `f08Root` overrides, or git-fetched D01 were **not** bulk-run as current acceptance.

## Actual experiments

1. **CW60 delivery-export.** Receiver compared whole `receipt.outputs` (absolute `path`, no `kind`) to `outputRefs()` payload rows. Fixed by named-output projection (exact name/kind/bytes/sha256). Partial-receipt export mapped `MailboxError` → `ExportRefuse` exit 2 without editing mailbox. Cold lockfile-pin-delta wrapper → mailbox pickup → export → independent receiver commit-before-ack → replay. M01 source-identity kept distinct from 1.0.0 archive identity.

2. **CW61 repeat/replay.** Two inherited catalog tests expected `actionable` on `samples/pricing/a` after mutating `gpt-4.1-input`. Independent analysis of that sample is **partial** (`USD/1M-Tokens` vs `USD/1M-tokens` on grok-4.6-input). Status mapping was not reversed. New clean-units control is `actionable`. Durable `.replay-capture/` + `wrapper-process.json` per run including refusal of run A. Legacy added-row `no-budget-delta` is a witnessed engine semantic defect, not readiness.

3. **CW62 batch/value.** Harness import root was five `../` segments; test dir is four levels down. Rebound `CURRENT_CORE_BASE` first to `6007fcfa`, then to `8a811bba`. Named-byte projection; M01 vs 1.0.0 archive identity branched. Desk→batch→value library and HTTP, kill/restart, interrupted batch, concurrent writers, substitutions, value event replay. `usefulPaidWork` remains false.

4. **CW70 cold HTTP consumer.** Ticket persists caller `executionId` before POST. Incomplete HTTP 200 `ok:true` is not analysis success. Redirects `error`. Foreign-origin retrieval refused. **`unsupported-portable-acquisition`** when only host paths exist. Explicit `fetch --local-artifacts DIR --acquire-to DIR`. In-tree `serve-execution.mjs` only; spawn-d01 git-fetch fallback removed. `httpArtifactsDelivered` stays false.

5. **CW65 independent harness countercheck.** Oracle no longer requires nested `receipt.executionId`. Pickup uses `outDir` + basename. `--only` cannot grant global readiness. Two **runtime witnesses** preserved (not rewritten, core not edited):
   - `d20-order-interrupt-before-complete`: reopen ran a second real engine (`executions.jsonl` 1→2, distinct execution IDs).
   - `d18-publication-rollback`: refused publication still overwrote a preexisting caller artifact.

6. **H7 chained cold journey.** `experiments/codex-window/h7-delivery/test/cold-journey.test.mjs` plus `evidence/cold-current-runtime-journey.json`: lockfile-pin-delta freeze/execute/export/outbox, vendor replay, two-row batch/value (`usefulPaidWork: false`), HTTP ticket `h7-cold-http` with portable unsupported then local acquire.

## PR145 completion: ship vs block (this turn)

Stacked draft **PR145** (`codex/h7-delivery-20260912`) sits on **PR143** (`codex/vendor-temp-lifecycle-20260912` exact `8a811bba`). Reproductions below were run on current pin `8a811bba` at source SHA **`4c4298713f8caba4fd34541797097b0f4b97f03c`**. Stale `6007fcfa` failures are not current evidence. Compact witness: `evidence/pr145-8a811bba-witnesses.json`.

Payment/authority on every path here: `usefulPaidWork` false, `sold`/`charged`/`purchaseAuthority` false, `fundingState` unfunded or rejected, `acceptanceClass: local-runtime`, ack ≠ buyer acceptance, no live pay, cash $0. HTTP portable acquisition remains `unsupported-portable-acquisition`.

### Commands (this turn)

| Command | Result |
| --- | --- |
| `node experiments/codex-window/cw65-delivery-adversarial-harness/run.mjs --only d20-order-interrupt-before-complete --evidence .../h7-8a811bba-d20-order-interrupt-before-complete` | **fail**, EXIT 2, controls pass, `runtimeUnchanged: true`, `ready: false` (`--only`) |
| `node experiments/codex-window/cw65-delivery-adversarial-harness/run.mjs --only d18-publication-rollback --evidence .../h7-8a811bba-d18-publication-rollback` | **fail**, EXIT 2, controls pass, `runtimeUnchanged: true`, `ready: false` (`--only`) |
| `flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 server/paid-useful-jobs/tests/vendor-temp-lifecycle.test.mjs` | **9/9 pass** (known-good for PR143; four application-handler-without-redelivery cases included) |

Heap 768, `--test-concurrency=1`, TMPDIR under `/tmp/h7/runtime-tmp` or owned `.cw65-owned-tmp`. PG 55590–55595 not started (these cases did not request a cluster). No processes torn down except this invocation’s CW65 scratch.

### Known-bad / known-good control

| Control | Pin | Result | Meaning |
| --- | --- | --- | --- |
| Four application-handler-without-redelivery tests | `6007fcfa` (ancestor) | fail | old unpublished 1.4.3 **not** release-ready |
| Same four + full vendor-temp pack | `8a811bba` | **9/9 pass** this turn | PR143 leak correction holds |
| `d20-order-interrupt-before-complete` | `8a811bba` at `4c42987` | **fail** | managed-order second engine; **not** the vendor-temp leak |
| `d18-publication-rollback` | `8a811bba` at `4c42987` | **fail** | wrapper non-atomic publication; **not** the vendor-temp leak |

PR143 changed 10 files (`release/lib/common.mjs`, `build-useful-jobs-v143.mjs`, kit/catalog 1.4.3 archives, `usefulJobsKit.json`, packaged + vendor-temp tests). `wrapper.mjs` and `tools/managed-useful-jobs-order` are **byte-identical** to `8a811bba` (`a991d18c…` / `cdca4a36…`). H7 did not edit them.

### What can ship independently

**PR143 vendor-temp leak correction can ship without waiting on PR145 or on d18/d20.** It is a proven cleanup of duplicate application signal-handler invocation. Archive **2615491** bytes, sha256 `a18ab918b5a6f60a6981903694aeba41d7d30dd8ad3e336f1d7b8fd22cf62b09`. Do not hold a safe cleanup fix for later consumer witnesses.

H7 consumer journeys on PR145 (CW60/61/62/70 + cold journey) are useful on this pin and stay stacked as draft PR145. They are **not** a release of d18/d20 and **not** a payment product.

### What still cannot ship as “current-runtime delivery ready”

| Witness | Status | Blocks PR143? | Owner (do not repair from this consumer charter unless Root authorizes the exact reproduced fix) |
| --- | --- | --- | --- |
| `d20-order-interrupt-before-complete` | fail on `8a811bba` | **no** | `tools/managed-useful-jobs-order`: `recordExecution` increments `executions.jsonl` independently of `store.complete`. Reopen after SIGKILL at before-complete ran a second real engine (`before: 1` → `after: 2`, `replayed: false`). First executionId `1ec7e90e-77b4-4c1d-b1f7-1a8073b47827`; reopen `653c2020-d399-4cdf-98a0-7858b8ddf423`. Engine archive is legacy 1.0.0 `6bf65039…`, not unpublished 1.4.3. |
| `d18-publication-rollback` | fail on `8a811bba` | **no** | `server/paid-useful-jobs/lib/wrapper.mjs` `publishCompleteOutputs()`: sequential `copyFileSync` with no staging/rollback. First caller artifact overwritten (34-byte “previous caller-owned publication\\n” → 1323-byte `s233.useful-application.artifact.v1`); second name was a directory (`EISDIR`); `result.ok` false; `sold` false. executionId `0f8aaaba-d10d-4426-888c-7ba7ccd7bc30`. |
| `d19-http-principal-boundary` | incomplete | **no** | HTTP adapter has no authenticated principal. Independent gate, later feature. |
| `d19-current-ledger` | incomplete | **no** | CW65 will not accept sibling `buyer-value-ledger` as its own countercheck. |
| `d20-current-outbox` | incomplete | **no** | CW65 will not accept sibling `job-delivery-outbox` as its own countercheck. |
| PG 55590 / 55591 / 55592 / 55595 | untested | **no** | No executed case required a cluster. |
| HTTP portable artifacts | `unsupported-portable-acquisition` | **no** | Honest: no download route. Explicit local acquire only. |

Assertions for d18/d20 were **not** rewritten. No owned H7 consumer code defect remained that this charter should patch; CW60/61/62/70 journeys already pass on `8a811bba`. Shared upstream files stay with their named owner.

### Exact next owner

1. **Root / paid-useful-jobs release owner of `codex/vendor-temp-lifecycle-20260912`**: merge or land **PR143** independently. Next owner of that cleanup is **not** H7 and **not** the d18/d20 suppliers.
2. **`tools/managed-useful-jobs-order` owner**: d20 before-complete interrupt → second engine. Repair only if Root authorizes this exact `8a811bba` reproduction.
3. **`server/paid-useful-jobs` wrapper owner**: d18 non-atomic `publishCompleteOutputs`. Repair only if Root authorizes this exact `8a811bba` reproduction.
4. **PR145 (`codex/h7-delivery-20260912`)**: remain draft, stacked on PR143. Do not default-merge. Consumer path is useful; it is not “delivery ready” while d18/d20 fail.

## Native usage (code-building / review; not customer jobs)

Session `01a094f5-dde1-70e1-ad54-481c90a8cd67`. Inclusion: **Grok stream-end input may be uncached; `usage.json` input includes cache.** Do **not** mix with historical customer-job revenue evidence (including any recorded 2.85 figure). H10 economics were not touched. Cash $0.

`usage.json` at this write (`/home/ubuntu/.grok/sessions/%2Ftmp%2Fh7%2Fwt/01a094f5-dde1-70e1-ad54-481c90a8cd67/usage.json`), last closed **2026-09-12T12:17:22Z**, **turnCount 3**. This `c6f1464` rebind is **turn 4** and is **not yet in `usage.json`**.

| Scope | input (includes cache) | cachedRead | output | reasoning | modelCalls | costUsdTicks |
| --- | --- | --- | --- | --- | --- | --- |
| Session through turn 3 | 49590678 | 47390336 | 337251 | 290790 | 275 | 149531959200 |
| Turn 1 | 37509511 | 35593472 | 299003 | 263052 | 232 | 108638302800 |
| Turn 2 | 7736193 | 7665024 | 15291 | 11371 | 21 | 27652852800 |

Uncached-equivalent input through turn 3 (input − cachedRead) = **2,200,342**. Primary model `grok-4.6-build`. Ticks are not a customer invoice. Not original-guide COGS.

## Unsupported boundaries

- HTTP has no artifact download route; portable acquisition is `unsupported-portable-acquisition`.
- HTTP `path` is not acquisition authority.
- Process-local execution cache is not durable across server restart; same-ID replay is not exactly-once recovery.
- GET does not prove caller payment/accepted terms or frozen request hash.
- Directory / rewritten job-document inputs remain `unbound-input-shape` in desk/replay.
- Loopback HTTP principal is process-local Authorization binding only; not an authenticated production identity provider.
- No live payment, no sale, callback ack is not buyer acceptance.
- Publication is not crash-atomic (documented on the repair).
- Multi-host / hostile filesystem / power-loss durability not claimed.
- Hosted transfer to an independent external customer not claimed (receiver still uses an operator-provided bundle dir).
- Child count is not product acceptance.

## Next integration owner

**Root / integration reviewer** of stacked draft **PR145** on `codex/useful-jobs-core-integration-20260912`. Review consumer rebind + HTTP principal; do **not** merge to public `main`. PR143 and PR146 repairs can land independently of leftover consumer polish.

Optional later: CW64 pin refresh against a future shipped archive (this client remains 1.4.1 packaged); a **new** useful-jobs package version if wrapper source must be distributed as a tarball (1.4.3 must stay immutable).

## Git / PR

Implementation controls SHA: `80aeb7be9e2c2e180641196a92f371edb9cf2eb9`.
Integration source: `c6f1464222169f2d32247c978dc5007d82a2aa03`.
Repair: `080cc62e7bc83f76431d916df34aea6d30875401`.
Archive identity: `8a811bbadba7edc6c926b319b0839cd2f01e5896`.

Draft PRs (branch push updates 145, does not merge):

- PR143 https://github.com/epistemedeus/samedaydesk/pull/143 — vendor-temp leak correction; **can ship independently**
- PR146 https://github.com/epistemedeus/samedaydesk/pull/146 — **merged** into integration at `c6f1464`
- PR145 https://github.com/epistemedeus/samedaydesk/pull/145 — consumer rebind; stacked draft

Compare (review this, not a silent `main` merge):

https://github.com/epistemedeus/samedaydesk/compare/c6f1464222169f2d32247c978dc5007d82a2aa03...codex/h7-delivery-20260912
