# W5-D15 RECEIPT — input/execute race harness

**Date:** 11 September 2026
**Assignment:** W5-D15
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d15-deterministic-input-execute-race-harness-4fc6`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/75
**Owned path:** `experiments/wave5/d15/`

## Tested pins

| Role | SHA |
| --- | --- |
| Product kernel `execution.v1` | `6bed72dd22a396134aa5c957933b42c3a5746698` (read-only worktree) |
| Negative baseline SDS52 | `aeef964fa188443078958d9d6d393afae1d542ee` |

Freeze-shim `--bind frozen` is **not** product acceptance.

## Product evidence

D01 copies caller files at materialize. Mutating the live path **after** `copyFileSync` (CLI `-r mutate-after-copy.cjs` and `createExecutor` hook) still executes the staged original. Engine `caller.after` is under `.../inputs/after.json`. Receipt `after.sha256` matches the inspected original, not the live mutation. Domain stays `actionable` / `fieldChanges=2`.

SDS52 `aeef964` mutate-then-call still executes the live mutation (`informational` / `fieldChanges=0`) and the receipt follows the live hash.

D01 useful no-change (`after` identical to `before`) is `ok: true`, `transport: ok`, `delivery.complete`, `analysis.status: informational`. Not a crash.

D01 HTTP `serve-execution.mjs` `/health` and `POST /execute` return `samedaydesk.paid-useful-jobs.execution.v1`.

## Remaining D01 bind (not skipped)

Mutating after `inspectSample`'s first `readFileSync` and **before** the materialize copy still executes the new bytes. Receipt follows the staged (mutated) hash. Kind `race-consumed-mutated`. Not an engine crash. D01 owns a freeze-at-inspect or refuse.

Concurrent caller `outDir`: isolated `runOutDir` values stay distinct (`actionable` vs `informational`). Published shared dir is last-writer-wins. `outputs[].path` on the caller dir follows that alias.

## Tests

```bash
node --test experiments/wave5/d15/test/*.test.mjs
```

**PASS** — 17 tests, 0 fail, 0 skipped (7 product kernel replay + 10 harness shim). Node v22.14.0. Postgres not required.

No homepage, wrapper, spend, or deploy in this PR.
