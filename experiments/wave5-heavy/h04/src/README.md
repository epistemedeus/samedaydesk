# H04 useful-job benchmark harness

Runs current SDS52 and selected W4 engines in **read-only** worktrees and records real stdout, exit codes, and `--out-dir` artifacts. SAMPLE / `--example` is not a customer job.

## Commands

From this directory (`experiments/wave5-heavy/h04`):

```sh
node bin/h04-benchmark.mjs list
node bin/h04-benchmark.mjs smoke
node bin/h04-benchmark.mjs run
npm test
```

`package.json` scripts: `npm run smoke`, `npm run benchmark`, `npm test`.

## Pins (fallback; inventory overlays when present)

| Engine | SHA | Worktree | CLI |
| --- | --- | --- | --- |
| `sds52-paid-useful-jobs` | `aeef964fa188443078958d9d6d393afae1d542ee` | `/tmp/w5-h04/ro-sds52` | `server/paid-useful-jobs/bin/cli.mjs` |
| `w4-json-schema-webhook-drift` | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | `/tmp/w5-h04/ro-w4-schema` | `tools/json-schema-webhook-drift/bin/webhook-drift.mjs` |
| `w4-lockfile-pin-delta` | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | `/tmp/w5-h04/ro-w4-lockfile` | `tools/lockfile-pin-delta/bin/lockfile-delta.mjs` |
| `w4-route-table-diff` | `7387eb677abd442dfab9081cb0ad95451fd2a762` | `/tmp/w5-h04/ro-w4-routes` | `tools/route-table-diff/bin/route-diff.mjs` |
| `w4-page-change-offline-job` | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | `/tmp/w5-h04/ro-w4-pages` | `tools/page-change-offline-job/bin/page-change.mjs` |

If `inventory/ENGINES.json` exists it is preferred; the table above is the fallback. Worktrees are chmod a-w; engines write `--out-dir` under `runs/` (or `/tmp/w5-h04/h04-runs/`). SDS52 extracts the useful-jobs kit to `os.tmpdir()`.

## Smoke

For each pin: `--help` and `--example` (SAMPLE labeled). SDS52 also runs `list`. Page-change `--example` is refused by the engine (not a delivered watch); smoke also runs `journey` with `--out-dir`. Records land in `runs/engine-smoke/<engineId>/`.

## Catalog run

`src/catalog.mjs` loads `examples/{schema-webhook,lockfile,api-routes,page-facts}/*/example.json` when present and does not throw if a family is empty or missing. Each run writes `runs/<exampleId>/<engineId>/meta.json`, `stdout.txt`, `stderr.txt`, `out/`, and `compare.json`.

`src/compare.mjs` compares engine artifacts to `expected-report.json` at fact level (`status`/`verdict`, highlight presence) as `match | mismatch | unknown`. Missing expected reports stay **unknown**. The harness does not invent a pass.

## Layout

- `src/engines.mjs` — pin table + inventory overlay
- `src/catalog.mjs` — example loader
- `src/runner.mjs` — spawn + capture (never ok without numeric exitCode 0)
- `src/compare.mjs` — fact-level compare
- `src/smoke.mjs` / `src/run-examples.mjs` — commands
