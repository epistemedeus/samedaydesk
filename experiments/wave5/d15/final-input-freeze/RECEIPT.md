# W5-D15 RECEIPT — final-input-freeze

**Date:** 12 September 2026
**Assignment:** Independent final-input check of the D01 release candidate at the prepare→execute boundary
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d15-deterministic-input-execute-race-harness-4fc6`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/75
**Owned path:** `experiments/wave5/d15/final-input-freeze/`
**No D01 production edits.** Root publishes after reconciliation.

## Pins

| Role | Value |
| --- | --- |
| Owning implementation | `46f2b7f55a7fb780333073a5197b64b8fde64a33` (PR74, `codex/w5-d01-20260911`) |
| Public PR114 | `9ae0febd8c184c0cbbb5e481ba31ac620e89b869` |
| Public archive | `client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz` **2579117** / `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb` |
| Kernel freeze (not re-run as coverage) | `e2f951cae7bb299df2283b9c181bb0d369fc26af` |
| Engine source (not re-audited) | `d2a0d0b2798e9a3951c43fe16dd64215207c3d9b` |

Read-only product worktree: `/tmp/d15-readonly/d01-46f2b7f`. Caller files under `/tmp/d15-final-*`. Node v22.14.0.

## Actual command

Default delivery CLI (first offer):

```bash
node /tmp/d15-readonly/d01-46f2b7f/server/paid-useful-jobs/bin/deliver.mjs \
  --job lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE"
```

Page job:

```bash
node /tmp/d15-readonly/d01-46f2b7f/server/paid-useful-jobs/bin/deliver.mjs \
  --job page-change-offline-job \
  --job-file "$JOB"
```

Prepare→execute probe (same CLI; mutates caller files after preflight, before `runCreateOrder`):

```bash
node --import experiments/wave5/d15/final-input-freeze/lib/preload.mjs \
  /tmp/d15-readonly/d01-46f2b7f/server/paid-useful-jobs/bin/deliver.mjs \
  --job page-change-offline-job --job-file "$JOB"
```

`--http` mounts loopback `POST /execute`. `--second-after` is the product disjoint second job.

## Verdict

**FAIL** on nested page-change captures. Catalog lock/schema/route files are frozen at prepare. Page `job.json` is fail-closed. Paid order and result mailbox do not bind nested capture bytes.

This is not an engine crash and not an unsupported-format refuse. Trusted local filesystem is not a sandbox; the defect is that inspected job meaning at prepare does not match executed capture bytes, and the order/mailbox records do not list those bytes.

## Observed

| Case | Result |
| --- | --- |
| Lock no-change vs changed | `informational` vs `actionable`. Complete mailbox pickup. |
| Schema no-change / unused-path partial / changed | `informational` / `partial` / `actionable` |
| Route changed; page `--job-file` no-change vs changed | `actionable` / `informational` vs `actionable` |
| `--http` lockfile | `ok`, `executeUrl` `http://127.0.0.1:*`, `actionable` |
| `--second-after` | disjoint `runOutDir` and mailbox `requestId`; first `actionable`, second `informational` |
| Shared `--out-dir` | last-writer published copy; receipts stay on isolated `runOutDir` |
| Lock/schema/route caller overwrite or symlink after prepare | **frozen-consumed**. Analysis stays `actionable`. Order `inputs[].sha256` stays the inspect digest. Live caller bytes match the overlay. |
| `--http` plus lock overwrite after prepare | still frozen-consumed |
| Page sibling `after.json` overwrite or symlink after prepare | **race-consumed-mutated**. Control is `actionable`/`changed`. Executed `informational` / `report.verdict: unchanged`. Order `--job` path is the original `job.json`. |
| Page `job.json` overwrite after prepare | **accurate-refuse** `f-input` ("buyer-echoed input digest does not match local file bytes"). Fail-closed. Acceptable. |
| Split `runPreflightStage` → mutate → `runCreateOrder` | same page-capture race without the loader |

## Minimal counterexample

1. Copy `tools/page-change-offline-job/fixtures/customer-job/{job,before,after}.json` into a temp dir.
2. Run the product CLI `--job-file job.json` once: analysis `actionable`, verdict `changed`.
3. Run again with the preload. After preflight, overwrite `after.json` with `before.json`.
4. Delivery stays `ok` / mailbox complete. Analysis becomes `informational`, `page-change.json` verdict `unchanged`.
5. `order.inputs` / `receipt.inputs` / `inputSha256` list only `--job` (job.json digest). Nested before/after sha256s are absent from the order, the execution receipt, and the mailbox envelope.

Cause in shipped code (`46f2b7f` `server/paid-useful-jobs/lib/delivery-kit.mjs`): `orderRequestFromPreflight` uses `rec.path` for `key === "job"` so sibling resolution can see the original directory. Preflight stages only `job.json`. Wrapper `freezeRequest` snapshots `job:before` / `job:after` at execute, not at prepare. Mailbox `seedFromD01Execution` stores output artifacts, not input captures.

Catalog lock/schema/route files use `stagedPath` and stay frozen. Do not treat that as covering page captures.

## Bindings

- **Order** binds catalog file sha256s (`--before`/`--after`/`--used`, or `--job`).
- **Execution receipt** repeats those catalog inputs.
- **Mailbox envelope** binds output artifacts only. Even lockfile input sha256s are absent from the envelope. That is not by itself a page-capture bug if the order record is the payment binding.
- Nested page captures are in none of the three.

## Not counted as this coverage

Sol four-core source review. Root `npm run test:useful-jobs-public` ten-job smoke. Prior D15 `cli.mjs` vendor-budget race at `e2f951ca`. Cold-download 1.1.0 ten-job re-run. 1.2.0 listing unknown-provider `partial` repair.

## Tests

```bash
node --test experiments/wave5/d15/final-input-freeze/test/*.test.mjs
```

**PASS** — 18 tests, 0 fail, 0 skipped. Node v22.14.0. Postgres not required.

## Next owner

**W5-D01** to freeze page-document siblings at prepare (or refuse when live capture bytes diverge from prepare-time bytes) and to put those sha256s on the order/receipt if a paid result must bind all semantic inputs. **Root** publishes after reconciliation. This consumer stops.
