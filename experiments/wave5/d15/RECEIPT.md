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
| Product kernel `execution.v1` | `e2f951cae7bb299df2283b9c181bb0d369fc26af` (read-only worktree) |
| Previous D01 kernel | `6bed72dd22a396134aa5c957933b42c3a5746698` |
| Negative baseline SDS52 | `aeef964fa188443078958d9d6d393afae1d542ee` |

Freeze-shim `--bind frozen` is **not** product acceptance.

## Immutable bytes

| Artifact | sha256 |
| --- | --- |
| Original vendor `after.json` | `5fe4ec1dbf3945ddb008f63ffee78cfea02559afa68b185eb80e57c42dbb3ee9` |
| Identical-to-before overlay | `c477e516ce555fd9b80bf5f3c25fc9d3389fb79db32ab1f5d601b355d7328499` |
| Stable domain (`status` + `summary`) | `d7bc07a159716191cd1530ddfd7643d7ff589386592951096d6cb0ae3556d2ff` |

Engine `digest` includes `generatedAt`. Unlike-run digests are not compared. Domain match is `status` + `summary`.

## Product evidence (`e2f951ca`)

Inspect-to-execute (`-r mutate-after-first-read.cjs`): live path mutated after the first `readFileSync`. Engine still reads staged `.../inputs/after.json`. Receipt `after.sha256` stays the inspected original. Domain `actionable` / `fieldChanges=2`. Kind `frozen-consumed`. Wrong receipt false. Stable domain sha matches the unmutated control.

Post-stage (`-r mutate-after-stage.cjs` and `createExecutor` hook): same frozen-consumed result. Engine consumed inspect bytes. Live file is the overlay hash.

`outDir` getter mutating the caller file after snapshot: frozen-consumed, receipt matches inspect hash, stable domain matches control.

Inputs getter: evaluated once. Receipt stays the original after hash.

Useful no-change (`after` identical to `before`): `ok: true`, `transport: ok`, `delivery.complete`, `analysis.status: informational`. Not a crash.

Concurrent shared caller `outDir`: isolated `runOutDir` values stay distinct (`actionable` vs `informational`). `outputs[].path` stays under `runOutDir`. Receipt `outputsDigest` values differ. Published shared dir is last-writer-wins (this run: published `informational`).

HTTP `serve-execution.mjs` with the inspect-window preload: `execution.v1` `/health`, `POST /execute`, `GET /results/:id`. Frozen-consumed, no wrong receipt.

## Negative evidence

SDS52 `aeef964` mutate-then-call: `race-consumed-mutated`. Engine `informational` / `fieldChanges=0`. Receipt follows the live overlay hash.

D01 `6bed72dd` inspect-to-materialize: still `race-consumed-mutated`. Inputs getter fired 6 times and executed the overlay. Not an engine crash. D01 owns that older kernel.

## Tests

```bash
node --test experiments/wave5/d15/test/*.test.mjs
```

**PASS** — 20 tests, 0 fail, 0 skipped (10 product kernel replay + 10 harness shim). Node v22.14.0. Postgres not required.

No homepage, wrapper, spend, or deploy in this PR.
