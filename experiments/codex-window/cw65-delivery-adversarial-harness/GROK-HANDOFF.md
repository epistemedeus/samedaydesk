# CW65 foundation handoff to native Grok Heavy

Status: **foundation, not ready**. Implementation stopped at the user's foundation-handoff boundary on 2026-09-12. One small current-core probe failed in the harness oracle. The full acceptance pack has never run. No shared runtime repair or upstream integration was performed.

Next integration owner: **native Grok Heavy, CW65 delivery adversarial harness**. Continue substantive implementation on an actual Cursor Cloud host. This closeout executed on the enrolled **Grok VM / node_grok_bot_vm**, whose hostname happens to be `cursor`; it was not Cursor Cloud and used no Cursor inference or nested model CLI.

## Repository and immutable inputs

- Repository: `https://github.com/epistemedeus/samedaydesk.git`
- Existing feature branch: `codex/cw65-delivery-adversarial-harness-20260912`
- Actual checked-out core base: `76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be`.
- Exact consumer import commit: `92d37a9803837b37be85a77fd454291faa5cd20c`.
- Read-only upstream integration branch: `codex/useful-jobs-core-integration-20260912`.
- Observed upstream head at closeout: `30345f69f16aca93bb95511ee4da62975c98cc04`. It was fetched for comparison only. It has 130 changed paths relative to the core base, including catalog/engine pin updates and staged 1.4.2 release files. None were imported into this feature. Do not describe this foundation as tested against that newer head.

| Imported consumer directory | Exact source commit |
| --- | --- |
| `experiments/wave5/d16/` | `a74aa3363efd6bb76f275a228aaeb9eaba9a686c` |
| `experiments/wave5/d18/` | `6d8a8c57ca47210938d3eb79398c648db1b6430b` |
| `experiments/wave5/d19/` | `058e6cdc7634d36f19a934c91090f0e4e7bc5833` |
| `experiments/wave5/d20/` | `7e116d7d4cadefc3204d6d6dc4c5f7296c25c4c9` |

All 79 original consumer files, receipts, negative fixtures, pins and licenses are unchanged byte-for-byte. `IMPORTS.json` records each source Git blob and SHA-256. New `current.mjs` files were added beside those historical sources. Historical SDS52/I01/Co02/Co09 tests are preserved evidence, not current product acceptance. Do not run their old pin loaders, worktree creators or npm installers as part of CW65.

Actual source hashes for the tested core and new harness are in `evidence/foundation-smoke/manifest.json`. Upstream drift and import preservation checks are in `evidence/foundation-validation/closeout-state.json`. The manifest's `hostname` field is just a hostname; the provider correction above and in `closeout-state.json` is authoritative.

## Implemented interfaces, not completed acceptance

All paths below are relative to the repository root. Let `PACK=experiments/codex-window/cw65-delivery-adversarial-harness`.

- `$PACK/run.mjs`: serial Node test launcher, separate control/acceptance TAP files, unique evidence directories, current shared-source hashes before/after, per-run scratch cleanup. Heap 768 MiB and test concurrency 1. `--only CASE` selects one acceptance case; controls still run separately.
- `$PACK/lib/context.mjs`: owned child processes, bounded timers, loopback HTTP clients/listeners, explicit process logs, fresh caller fixtures, package snapshots. Uses assignment-owned TMPDIR when supplied.
- `$PACK/lib/oracle.mjs`: whole-stdout JSON and exit-status checks; independent artifact SHA-256/name/size checks; request/job/receipt identity assertions. **Has the verified contract mismatch below.**
- `$PACK/workers/current.mjs`: thin adapters to in-tree executor, execution HTTP, managed-order store, current delivery catalog and D03 verifier. `execute` can pause after real input staging. `order` decorates the real store at `reserved`, `execution-recorded`, `before-complete`, and `completed`; it does not implement a store or engine. `http` uses a separate client process.
- `$PACK/workers/fs-barrier.mjs`: child-only `renameSync` observation shim, with before/after pause and unchanged underlying filesystem operation. Used by unfinished mailbox interruption tests. No production file is patched.
- `experiments/wave5/d16/current.mjs`: current vendor/lockfile CLI cases, missing/malformed input refusals, staged input mutation.
- `experiments/wave5/d18/current.mjs`: simultaneous jobs sharing a publication alias, sequential unlike jobs, current verifier corruption checks, partial-publication rollback witness.
- `experiments/wave5/d19/current.mjs`: HTTP body/key/principal probes, duplicate/distinct order processes, explicit missing current-ledger gate.
- `experiments/wave5/d20/current.mjs`: durable order interruption/reopen, corrupt replay refusal, mailbox commit/ack interruption, wrong body/key/bytes, explicit missing current-outbox gate.
- `$PACK/test/controls.test.mjs`: eight independent broken-engine processes plus a synthetic identity-oracle mutation test. These are expected rejection controls with zero readiness credit.
- `$PACK/test/acceptance.test.mjs`: registers 21 proposed current-core cases with per-case verdicts. Only `d16-current-vendor` has been attempted, and it stopped on its first execution assertion.

## Verified results and exact failure

1. **Syntax only: 11/11 files pass** `node --max-old-space-size=768 --check`. Raw results: `evidence/foundation-validation/syntax.json`.
2. **Independent controls: 9/9 pass**, zero skipped, about 0.65 seconds. Raw: `evidence/foundation-smoke/controls.tap`, plus child stdout/stderr/status under `evidence/foundation-smoke/cases/control-*/`.
3. **One selected acceptance case: 0 pass, 1 fail**, runner exit 2. The actual current vendor CLI returned `ok: true`, `transport: ok`, and two output artifacts. The oracle failed at `$PACK/lib/oracle.mjs:30`: `body.receipt.executionId` is `undefined` while top-level `body.executionId` is populated. Current managed-order validation treats nested execution ID as optional. This is a **harness contract mismatch**, not a verified engine regression.
4. No full suite, Postgres, current outbox, current ledger or cross-principal acceptance was run. No other proposed acceptance case has passed. The no-change half of `d16-current-vendor` was not reached.
5. `runtimeUnchanged: true`; 79 imported source files still match; all 9 recorded child PIDs were reaped. The runner removed its own scratch tree, and its empty assignment-owned scratch parent was removed. Raw caller inputs, process streams, receipt and artifact copies are tracked in Git.

Exact failure evidence:

- `evidence/foundation-smoke/cases/d16-current-vendor/verdict.json`
- `evidence/foundation-smoke/cases/d16-current-vendor/processes/00-changed.stdout`
- `evidence/foundation-smoke/cases/d16-current-vendor/packages/changed/`
- `evidence/foundation-smoke/summary.json`

Paths inside raw results retain the original VM absolute paths as evidence. Reproduction generates fresh inputs and paths under the new checkout. The copied packages and input files are in Git; no source or required fixture exists only in an old `/tmp` tree.

## Ordered remaining work and exclusive write paths

1. **Reconcile the oracle with the actual pinned contract**, exclusively `$PACK/lib/oracle.mjs` and `$PACK/test/controls.test.mjs`. Decide whether nested receipt execution ID is optional under the current accepted contract; retain a negative control for a contradictory ID when present. Do not force an engine change merely to satisfy this assertion. Re-run only the small vendor probe first and preserve the original failure directory.
2. **Repair the other source-visible scaffold defects**, exclusively `$PACK/lib/context.mjs`, `$PACK/run.mjs`, `$PACK/workers/`, and the four `current.mjs` files. `verifyPickup()` in D20 reads `copy.path`, but current mailbox pickup exposes `outDir` plus artifact name/hash/bytes and omits per-artifact `path`; join the known pickup destination with a validated name. A filtered `--only` run currently can set `ready: true` if its selected case passes; change it to report selected-case status separately and never global readiness. Review cleanup on test cancellation/spawn failure, bounded output handling, process group ownership, and snapshot capture before adding more cases. These defects were found by source inspection, not by running those tests.
3. **Validate staged input/output isolation**, exclusively `experiments/wave5/d16/current.mjs`, `experiments/wave5/d18/current.mjs`, and `$PACK` support files. The simultaneous executor case already pauses both real processes at staged input boundaries. Confirm both receipts bind their own bytes, including shared publication aliases. Keep D03 current archive identity derived from the current catalog, never trusted from the result under test. Preserve deliberate corruption artifacts separately from acceptance results.
4. **Validate managed-order interruption and replay**, exclusively `experiments/wave5/d19/current.mjs`, `experiments/wave5/d20/current.mjs`, and `$PACK` support files. Run reservation-before-execution, engine-complete-before-store-complete, and durable-complete-before-stdout cases independently. The before-complete case is designed to expose a second engine run by counting real durable `executions.jsonl` rows. Do not assert that it has already reproduced. Add necessary bounded worker synchronization without replacing the real engine/store.
5. **Finish mailbox acceptance**, exclusively `experiments/wave5/d20/current.mjs` and `$PACK` support files. Verify pre-commit invisibility, post-commit replay, immutable slot conflicts, corruption refusal, separate pickup/ack, and interruption recovery. The FS shim delegates real renames, but its tests have not run. Preserve abandoned stage directories in case evidence before cleanup.
6. **Resolve missing integration surfaces with the native core/vendor owner**, with reports only under `$PACK`. `tools/job-delivery-outbox/` and `tools/buyer-value-ledger/` are absent at the tested base. The HTTP adapter is loopback/process-local and has no authenticated-principal contract. Do not substitute old Co09/Co16 implementations or count arbitrary synthetic Authorization headers as authenticated principals. Keep these gates incomplete until a current owner-provided interface/pin is available. PostgreSQL is optional and untested; if used later, use dedicated port 55595 with its own cluster/process cleanup and existing toolchain.
7. **Freeze the agreed current-core pin and run the bounded complete pack**, exclusively the owned harness paths. The newer integration head must be reviewed with its owner; no blanket merge, runtime edit, release edit, or CW60–64 consumer change. Preserve expected failure controls apart from readiness and write small exact vendor witnesses for actual reproduced runtime failures. The existing publication rollback and ambiguous rerun cases are predictions only until executed successfully as witnesses.
8. **Export the completed consumer work on this same feature branch**, update this handoff and closeout status, and keep the PR draft until acceptance is truthful. No default merge/publication, credentials, signing, real payment, new model CLI, broad unrelated suite, or unsolicited outreach.

## Portable acceptance commands

From a fresh clone of the feature branch with existing Node 22 tooling, run commands from the repository root. Choose a NEW evidence directory on every attempt; the launcher refuses overwrites.

```bash
PACK=experiments/codex-window/cw65-delivery-adversarial-harness
mkdir -p "$PWD/.cw65-owned-tmp"
TMPDIR="$PWD/.cw65-owned-tmp" D16_PIDFILE= NODE_OPTIONS=--max-old-space-size=768 \
  node --max-old-space-size=768 "$PACK/run.mjs" \
  --only d16-current-vendor --evidence "$PACK/evidence/grok-vendor-probe-001"
```

The saved version is expected to exit 2 with the nested receipt ID mismatch above. Run the same command after the oracle repair with a new evidence path. The runner already selects `--test-concurrency=1`; independent children within one case are intentional.

After the small repairs, isolate proposed witnesses with `--only d18-publication-rollback` or `--only d20-order-interrupt-before-complete`. These have **not** been executed. At final validation, omit `--only` to run the full proposed pack. Do not do that merely to produce a larger test count before fixing the scaffold.

Control set: decoy JSON, empty stdout, invalid JSON, nonzero exit, structured refusal, success without outputs, stderr-only JSON, hang, plus wrong execution/input/nested digest/duplicate output/sold/changed bytes against the independent oracle. Controls passing never establish product acceptance.

End-state contract for the next owner: a truthful full acceptance report or exact current-core witnesses plus incomplete gates, with all useful source/evidence durable in Git and shared production code untouched.
