# W5-D01 RECEIPT — supplied-input execution contract

**Task:** W5-D01  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w5-d01-20260911`  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`  
**HEAD / PR:** filled after push  

## What

Extended SDS52 `runPaidOffer` into one executor (`createExecutor`). Isolated staging and out dirs; caller `outDir` is published only when this run's expected artifacts are complete. Kit acquisition is inside the try path. Transport, analysis, and delivery are distinct fields. Thin CLI + loopback HTTP consume the same kernel. No competing runner. `sold` remains false.

## Current-source findings (SDS52 `wrapper.mjs` at `aeef964`)

Reproduced as predicted by Pilot `REVIEW-INTEGRATION.md`:

1. Kit `ensureUsefulJobsKit()` ran **before** the try block.
2. Caller `outDir` was reused; outputs were `existsSync`-filtered (stale files could count as this run).
3. Inline JSON SAMPLE **strings** were not inspected (`inspectSample` only parsed objects / existing files).
4. Engine `ok === false` was collapsed into wrapper failure without delivery/analysis split.

## Tests

Command: `npm run test:paid-useful-jobs`  
(revision pending execution on this branch)

## Integration limits

- Tested implementation: this branch's `samedaydesk.paid-useful-jobs.execution.v1`. Not a future sibling.
- D04 must drop `tools/managed-useful-jobs-order/` competing runner and call this contract.
- D08 Python client and D14 independent HTTP consumer are **not** this result.
- M01 catalog/engine selection is not claimed here; engines remain the PR51 archive.
- No live settlement, catalog publication, production deploy, or new spend.
- pstack: plugin cache has `setup-pstack/SKILL.md`; `~/.cursor/rules/pstack-models.mdc` absent; slash not invoked; no extra Cloud/Task agents (Root counts the cohort). Parent model from run-info: Cursor Grok 4.6 xhigh.
