# H64331 complete source and installed receiving

Received October 29, 2026, through 21:12:39 UTC. [SameDayDesk 344](https://github.com/epistemedeus/samedaydesk/pull/344) is ready for Root's release at clean pushed head `63e4076d1ffd98bc2f561fbb4c66d2fedb714830`, tree `0619ee40acd45537fe1fde8723d07152ef09508a`. Matching runtime-startup CI `40955603304`/job `123734778300` succeeds at 21:12:39, merge state CLEAN. Both earlier CI failures, their distinct causes and tested corrections are preserved below. This controller has not merged or deployed. Root owns the configured managed release and provider receiving.

## Exact outcome

Clean, canonically pushed head `eb18a6ed7f16c687e236dc1ba5d69c54d563a217`, tree `0d7fd17b0cdef1cb64154efb047cb2c592566b72`, branch `codex/root64331-receive-time-freshness-20261029`, base `a5b40cb015d30de8bf8f3cbbeda1360151279fb0`. Two commits, zero behind, 17 scoped files. The receiving controller read all changed source and complete RESULT/NEXT, input closure, inventory and installed acceptance evidence. All 17 Git blobs were independently received and SHA-1 verified; their complete bytes and SHA-256 index are retained privately.

Native EXIT 0, ENDED 20:23:45 UTC, export complete with matching remote head and zero dirty paths. At 20:41:43 native PID 15085 and wrapper 15083 were absent. Original session `c72554e1-2fe0-41ea-9185-2db62a020b92`, host `bc-1ab8063b-20f7-4ff1-a0e2-365a86222e62`, boot `2f11e9d6-78ce-4451-b47b-565fd931a461` remain the original admitted identities. The earlier Sol producer `ddbd766a` remains not-dispatched after its actual memory refusal, not a failed implementation or replaced source.

## Cause and correction

The SDS scheduler sampled `clock()` before asynchronous source transport. Passing that frozen instant into the pinned maintained reader could classify a response stamped during the request as future. The service now passes its clock function; the source wrapper supplies that live observer to the existing maintained consumer. Explicit scalar/Date injections remain frozen. Request-start, observation and receipt clocks are retained separately. Caller cancellation and read-budget timeout are distinguished without relaxing the freshness boundary.

The owning changes are `server/lib/managed-watch/service.mjs` and `source.mjs`, directly coupled regression tests, one test command, and `experiments/oct29-receive-time-freshness/`. Neo dependency `d9038c21964a0a736ebb115b4718a83231d7dd42` and the 88319-byte pinned archive remain unchanged, SHA-256 `a5248cac86ae604b365d95e3c21da5c15cd09f1a962428eb7d60b4c3b210100f`. No tolerance widening, historical relabeling, production database mutation, public enrollment, new monitor or scheduler activation occurred.

## Installed positive, failure and recovery evidence

Actual delayed HTTP with the same maintained consumer proves the old frozen control at age -499 ms and the receipt-time path at age 1 ms. A truly future timestamp remains refused at age -119999 ms. The maximum age remains 48 hours. Stale, malformed/missing clock, partial metrics, HTTP, parse, timeout, caller abort and private-DNS refusal retain their distinct boundaries.

Disposable Postgres, the mounted managed-watch service and an owned durable HTTP recipient prove baseline establishment, useful synthetic change, recipient response loss after commit and same-ID readback. Recipient restart retains the delivery digest and one duplicate. Service and Postgres process restart retain both results and the same operation/event identities without a new source call. A process killed after the fetched body was stored recovers without rewriting its source timestamp or fetching again. A process killed while reading records unknown/lost_reply_no_body, also without refetch. Earlier delivery IDs remain intact.

`npm run test:managed-watch` passed 17 tests. `npm run test:receive-time-freshness` passed at 20:20:45.107. Recorded aggregate sampled test-process RSS was 316624 KiB. Synthetic capture stays injected; the existing public-source case remains partial_metrics and not useful delivery. This is not an outside customer or revenue claim.

## Actual emitted release boundary

Root's official provider read at 20:55 supersedes the stale service-registry inference: SameDayDesk auto-deploy is false, Node 22/Express entry `server/index.js`, build script `build:managed-foundry`, deployed source `c4ec17a891e19177d574ed79faaac25d295d2743` on Hostinger `01a185b4`. The release controller is distinct from the EIN auto-deploy route. No provider change was made. Exact restricted read: `id/ae90-root-coordination/root70200-sds-provider-before/SUMMARY.json`.

The following initial comparison is scoped default-build evidence, not proof of the configured managed projection. After native completion, a small model-free controller ran the repository's `npm run build` serially on the same VM in two separate exact base/candidate worktrees. Node was 22.23.4. That default command performs `npm --prefix client install --include=dev` followed by the actual client feed, TypeScript, Vite and route-shell build. The separate configured managed-build check is received below after the reviewer correction.

Both builds exited 0. At 20:50:50.832 their complete emitted output inventories were raw-equal: 351 files, 59949496 bytes, including 139 HTML files and all 294 old public assets. No normalization or ignored generated-time difference was used. Both full manifests and all build output were received; exact equality was independently checked from the complete arrays.

The first base build succeeded, but a strict lock-equality guard then stopped the controller. The ordinary existing npm command removed `libc` metadata from ten optional-platform lock entries. No dependency version changed. That first non-completion receipt remains intact. The controller resumed only the missing candidate build and comparison, preserving the already-built base. Both scratch lockfiles have the same resulting SHA-256 `45102616608039c6dfe79dacf90bd5d68e31073db487bf44f4912cf6da67c83a`; source lock SHA-256 is `c36b4c5fdba2179b9d948c75d3fa86e30657525e026271e3ce83c922198b0e7c`. These scratch changes were not copied into the writer branch. The original writer remains clean at `eb18a6ed`.

Base full manifest SHA-256 `90d37899a5e79a81f8038070d9066d73ebae74ca4f1b43339369872eeea31b4a`; candidate manifest `f11648c005f54f5ad34dab1c3e1135424cb606615bafded78d20a367f5108802`. Full manifest metadata intentionally differs by pin/path; every emitted file's bytes and hash are equal.

## Control and remaining owner

Original bounds stayed checkpoint 20:45/tail 21:00. The separate finite foreground expires 21:39:42 and was not shortened. No new inference turn or reviewer was used. The H31 obsolete exact watcher was previously contained without signaling native or wrapper; this is preserved containment, separate from H32's isolated ordinary-wait next-use. H31 does not establish global launcher repair.

Included-Cursor anchor `run-821f6a49-76c6-4425-a7c7-80311d3a0f53` completed with actual chargedCents 0 and rawCostCents 36.0178, received 20:10:47. This is control-pool usage, not native Heavy usage or revenue. Safe native final metadata records end_turn and grok-4.7-build; hidden reasoning was not read.

PR 344 was created once through CLI, attached, and read back with the exact head and scope. Its runtime-startup CI then failed two caller-closure cases. The matched same-VM production-install control proves base 7/7 and candidate 5/7. All 548 declared members were checked: only `package.json`, `service.mjs` and `source.mjs` mismatch. The small reviewer correction removes the alias, advances only the two actual runtime hashes, retains the accepted predecessor closure and preserves original native evidence. No verifier weakening or new native turn is involved. Root still owns merge, the actual managed Hostinger release and configured-provider receiving. No release or paid service activation is implied.

Reviewer source `76355479` restores package.json exactly to the accepted bytes. The previous closure `sha256:fc14eac1601172bfbfc9a30480455281ae75d6528e24733740f022939496d68e` is appended to the twenty existing retained closures. The resulting current digest is `sha256:855798f4388baf944a6d8d7792d8769303564e00a17ce7bbe36c958df67859b0`. All retained caller identities pass, and tampering with either repaired runtime member is refused. The verifier itself is untouched.

At 21:00:45 the remote reviewer has passed proxy 7/7, startup diagnostic 7/7, hosted startup 4/4, managed-watch 17/17 and the direct installed delayed-HTTP/Postgres/recipient recovery check. The reusable command is now `node experiments/oct29-receive-time-freshness/accept.mjs`; the original native command/receipts remain historical evidence rather than being rewritten.

Both original-base and amended-candidate `npm run build:managed-foundry` commands pass on separate same-VM paths. Each receives the pinned standalone deployable runtime and the actual managed-node probe, with reference execution, OS limits, launcher identity and PID preservation true; activation remains HOLD/false. Complete emitted arrays are again raw-equal across 351 files/59949496 bytes, 139 HTML files and 294 old public assets. This path uses client npm ci, so both client lockfiles remain at the original source hash. Full raw logs, manifests, exact counterfactual and reviewer installed evidence are committed under `experiments/oct29-receive-time-freshness/evidence/reviewer-receiving.json` and described by `REVIEWER-RECEIVING.md`. The original native RESULT and installed evidence are preserved.

### Shared PostgreSQL fixture correction

CI `40954057549` passed the repaired caller closure, then failed before all four original-task test files: the common disposable-Postgres fixture searched only fixed 16/17 directories and ignored the workflow's supplied `PULSE_PG_BIN=$(pg_config --bindir)`. That CI step did not emit the actual version, so no version is inferred. The controlled VM reports PostgreSQL 16.15 at `/usr/lib/postgresql/16/bin`.

Final source `63e4076d` makes the owning shared fixture honor an explicit complete executable `PULSE_PG_BIN` or refuse it. Without an explicit choice it uses actual `pg_config --bindir`, then a complete PATH directory, with a distinct unavailable refusal. There is no version list. Resolution occurs at cluster creation. The returned selected bin also replaces the freshness test's separate hardcoded restart path. Seven focused controls cover future-version path selection, tool/PATH discovery and invalid, incomplete, non-executable or unavailable inputs. The workflow now runs those tests without a new npm alias.

The affected fixture, test, workflow and acceptance files are not caller-closure members, so no further caller pin or retained identity changed. All actual CI-selected suites ran serially on the VM: resolver 7/7, proxy 7/7, startup diagnostic 7/7, hosted startup 4/4, machine discovery 4/4, pulse 80/80, original-task 14/14, agent-readiness 150/150, L08 28/28, MCP 46/46, public load failure 1/1, observatory 78 passed plus its two existing opt-in skips (historical capture and live GET), managed-watch 17/17, and direct installed freshness/restart/recovery passed. No failures or disabled assertions. Complete raw output is committed under `evidence/postgres-fixture-receiving.json`; `POSTGRES-FIXTURE-RECEIVING.md` documents reuse and the prior CI failure. This final amendment changes only test/CI/evidence source, not the production runtime/public bytes already received through the configured managed build.

## Restricted receipt locators

- `id/ae90-root-coordination/ROOT67531-RECEIVED-2026-10-29T20-41-53-269Z/FINAL2040.json`: actual native terminal/export and safe final metadata.
- `ROOT67535-H31-SOURCE/INDEX.json`: full received changed-source closure and per-file hashes.
- `ROOT67531-RECEIVED-2026-10-29T20-49-13-571Z/RELEASE-COMPARE.json`: original successful base build and strict lock guard stop.
- `ROOT67531-RECEIVED-2026-10-29T20-51-20-763Z/RELEASE-COMPARE-CONTINUED.json`: full paired logs/manifests/raw equality, 221100 bytes, SHA-256 `7bead25f512fc9c8eb996a322df51d5cf117deedec2756a8fc4e8dfc55dfd6d1`.
- Same VM `/home/ubuntu/root67536-h31-release/`: preserved exact build worktrees, logs and both results. No cleanup or destructive reset was performed.
- `ROOT67531-RECEIVED-2026-10-29T20-56-15-583Z/CALLER-DIAGNOSE.json`: matched base/candidate failures and complete 548-member mismatch assessment.
- `ROOT67531-RECEIVED-2026-10-29T21-01-03-717Z/REVIEWER-FIX.json`: complete reviewer transition, focused tests, actual managed builds and canonical commit/push receipt, 226799 bytes, SHA-256 `69c7d5c5a90cca699f8de5903420f4db096e228a1cba05040ceb6ccf66c5bc7c`.
- `ROOT67531-RECEIVED-2026-10-29T21-11-48-815Z/POSTGRES-FIX.json`: exact fixture correction, real toolchain, every CI-selected remote command and final push, 120844 bytes, SHA-256 `41210ee89e71a37697fc067ca47f2e67837c4f1308d0ead26fea2218950f5379`.
