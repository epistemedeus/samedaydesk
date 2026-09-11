# W5-D01 RECEIPT — supplied-input execution contract

**Task:** W5-D01  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w5-d01-20260911`  
**HEAD:** `fb4c6ae31445a0f8cfc6c5fd55eda0fd13b37741`  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**Tested kernel SHA:** `bccf34b3816ebe20d43823d0978308fd10f9bb33`  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/74 (draft)  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`

## What

Extended SDS52 `runPaidOffer` into one executor (`createExecutor`). Isolated staging and out dirs; caller `outDir` is published only when this run's expected artifacts are complete. Kit acquisition is inside the try path. Transport, analysis, and delivery are distinct fields. Thin CLI + loopback HTTP consume the same kernel. No competing runner. `sold` remains false.

## Changed paths

- `server/paid-useful-jobs/` (wrapper kernel, contract, HTTP, tests, CONTRACT.md)
- `experiments/wave5/d01/RECEIPT.md`

## Current-source findings (SDS52 `wrapper.mjs` at `aeef964`)

Reproduced as predicted by Pilot `REVIEW-INTEGRATION.md`:

1. Kit `ensureUsefulJobsKit()` ran **before** the try block.
2. Caller `outDir` was reused; outputs were `existsSync`-filtered (stale files could count as this run).
3. Inline JSON SAMPLE **strings** were not inspected (`inspectSample` only parsed objects / existing files).
4. Engine `ok === false` was collapsed into wrapper failure without delivery/analysis split.

## Tests

```bash
npm run test:paid-useful-jobs
```

**PASS** — 46 pass, 0 fail, 0 skipped, 0 cancelled (`node --test server/paid-useful-jobs/test/*.test.mjs`).  
Suites: continuity 8, execution-contract 12, journey 6, live-prices 3, seeded 9, wrappers 8.  
Includes real CLI (`spawnSync` cli.mjs), real engine archive, loopback HTTP POST/GET, and `serve-execution.mjs` process `/health`. Missing deps were not skipped.

Postgres is not required for this claim.

## Integration limits

- Tested implementation: `samedaydesk.paid-useful-jobs.execution.v1` at kernel SHA `bccf34b3816ebe20d43823d0978308fd10f9bb33`. Not a future sibling.
- Remaining binding: D02–D16 consume this contract. D04 must drop `tools/managed-useful-jobs-order/` competing runner.
- D08 Python client and D14 independent HTTP consumer are **not** this result; loopback HTTP here is a thin adapter over the same kernel, not D14.
- M01 catalog/engine selection is not claimed; engines remain the PR51 archive.
- No live settlement, catalog publication, production deploy, or new spend.
- pstack: plugin cache has `setup-pstack/SKILL.md`; `~/.cursor/rules/pstack-models.mdc` absent; slash not invoked; no extra Cloud/Task agents (Root counts the cohort). Parent model from run-info: Cursor Grok 4.6 xhigh.
