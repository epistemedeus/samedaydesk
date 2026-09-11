# W5-D01 RECEIPT — supplied-input execution contract and delivery composition

**Task:** W5-D01  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w5-d01-20260911`  
**HEAD:** (branch tip after this commit)  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/74 (draft)  
**Pilot source:** `epistemedeus/pilot@254e4c46259842ac6b0e66943e6568b1681e8e01`  
**Kernel freeze:** `e2f951cae7bb299df2283b9c181bb0d369fc26af`  
**D15 read-only:** `a44fbf4` PR 75 (`experiments/wave5/d15/`). Inspected export only. Freeze-shim `--bind frozen` is not product acceptance and was not copied.  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1` (unchanged version string)

## What

Kernel freeze: getters once; file bytes slurped at snapshot; copy before inspect; engine and receipt use staged/`runOutDir` bytes. Caller `outDir` is a publication copy, not delivery identity. D15 harness was not vendored.

This composition continues that kernel into one locally callable supplied-input delivery kit: D02 preflight → D04 managed order → D01 executor → D03 `verifyComplete(runOutDir)` → D05 mailbox pickup/ack, plus a disjoint second job. Transferred paths were selected-path checkouts (D02 `6ac8ad6e`, D03 `c89865f3`, D04 `c1f1e5f8`, D05 tip `bc0b6e3` / tested `38d09206`, D28 `049e8592`). Ancestor branches were not merged. Duplicate mailbox engine runner was deleted, not wrapped.

D15 exact export at `a44fbf4`: `runRace` / `spawnPaidCli`, `startRaceServer`, `BIND`/`KIND`/`REFUSE_CODE`, `freezeCallerInputs`/`liveDrift`, `ensureKernelRoot`/`D01_SHA`, `replayKernelCli`. Product evidence there is replay of **this** freeze at `e2f951ca` (CLI, HTTP `/execute`, getters, useful no-change). Not copied.

## Current-source findings

At `6bed72dd` (and SDS52 `aeef964`): `inspectSample(request)` ran before the main try; `request.inputs` was read again at materialize (6 reads in a getter repro). Mutating the live file on a later getter executed the new bytes; receipt sha256 followed the mutation, not the first observation. After complete delivery, `outputs`/`outputsDigest` were re-read from the caller alias, so a concurrent publisher could become another run's receipt.

D02 claimed D01 did not pricing-row schema-check, so schema-invalid staged bytes could still execute there. That gap is closed at service entry (`lib/input-schema.mjs`). Invalid `{ hello: "world" }` pricing JSON is `input-schema-mismatch`, not useful.

`createExecutor({ catalog })` / `createExecutor({ getJob })` is the catalog injection seam. M01 was not integrated. H05 is not this repo.

## Consumer command

```bash
node server/paid-useful-jobs/bin/deliver.mjs \
  --job vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json
```

`--http` mounts loopback `POST /execute`. `--second-after` runs a disjoint second job. Isolated `runOutDir` is delivery identity; `publishedDir` is last-writer convenience copy.

## Tests

Kernel freeze at `e2f951ca`: **51 pass**, 0 fail, 0 skipped.

Composition measured on this branch (Node v22.14.0). Implementation SHA before this receipt commit: `becc8a5811c47f2d8c5e00604791144fd73bab54` plus the D04 lazy-`pg` import and D28 findings assertion in the following commit.

| Script | Result |
| --- | --- |
| `npm run test:paid-useful-jobs` | **67 pass**, 0 fail, 0 skipped (7 suites: continuity 8, delivery-kit 12, execution-contract 21, journey 6, live-prices 3, seeded 9, wrappers 8) |
| `npm run test:job-input-preflight` | **39 pass**, 0 fail, 0 skipped |
| `npm run test:job-output-atomicity` | **26 pass**, 0 fail, 0 skipped (7 suites) |
| `npm run test:managed-useful-jobs-order` | **21 pass**, 0 fail, 0 skipped (7 suites; disposable Postgres 16) |
| `npm run test:result-mailbox` | **21 pass**, 0 fail, 0 skipped (5 suites) |
| `npm run test:d28-journey` | **18 pass**, 0 fail, 0 skipped (6 suites) |

**192 pass**, 0 fail, 0 skipped across owned entrypoints. D03 Postgres TCP `127.0.0.1:5432` is `untested-external`; completeness does not depend on it. D04 uses a disposable `initdb` cluster.

## Integration limits

- Same `execution.v1` fields. Receipts bind `runOutDir`; `publishedDir` is the optional alias copy, never receipt authority.
- D15 remains independent harness owner. Freeze-shim is not this kernel.
- M01 four-engine paths and `tools/json-schema-webhook-drift/`, `lockfile-pin-delta/`, `route-table-diff/`, `page-change-offline-job/` were not edited.
- No multi-tenant hosting, live settle, deploy, spend, or default merge.
