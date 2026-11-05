# Workflow-owned extensions

Source-only package that embeds the existing SameDayDesk `result-reuse`
capability in one supported workflow runtime and one second consumer adapter.

- Runtime embedding source: Ghost Admin API driver that can create, update,
  and delete an unpublished draft from a reused observation. Committed status
  stays `not yet executed on runtime` until a VM writes a separate output file.
- Dify tool interface remains (`preview_reuse`, `export_reuse`, `decide_or_reuse`).
- Offline Ghost projection still builds an unpublished-draft shape without
  calling Ghost. The live driver is separate (`src/ghost-runtime.mjs`).
- Capability: `tools/result-reuse` (read-only import of the existing SDK and
  schema). Merchant cores are not copied or modified.
- Status: `installationStatus` stays `source_only_not_installed`.
  `runtimeExecutionStatus` stays `not yet executed on runtime`.
- When Dify or Ghost is unavailable, execution uses the existing local
  result-reuse CLI and SDK. That direct path is the useful fallback, not a
  claim that a workflow runtime ran.

This package does not add a catalog, host uploaded code, or change files
outside `tools/workflow-owned-extensions/`.

## Why Ghost for the actual runtime, and why Dify stays a source interface

Ghost 6.75.0 local (SQLite, ghost-cli 1.34.1, node >= 22.23.1) is the cheapest
fitting supported runtime for an actual Admin API embedding. It needs no Docker
compose stack or plugin daemon. The decision record is `runtime/DECISION.md`.

Dify remains the source-only workflow tool interface. Pilot already maintains
the `dify-table-csv` 0.1.2 recipe. E02 asked for a new useful downstream
embedding rather than another installation of that table-csv recipe, and the
Dify document-to-CSV versus direct-reader comparison is closed. This package
embeds result-reuse instead.

Native Tasks remains wire-only without a durable TaskStore, so it is not the
runtime here.

When Ghost is unreachable, execution uses the existing local result-reuse CLI
and SDK. That direct path is labeled as fallback, not as a runtime claim.

## Commands

```bash
node tools/workflow-owned-extensions/cli.mjs preview \
  --input tools/workflow-owned-extensions/fixtures/inputs/fitting-n45-page-change.json \
  --task-id n45-example-com \
  --subject n45-example-com-result \
  --sequence 1 \
  --clock 2026-09-09T08:00:00.000Z

node tools/workflow-owned-extensions/cli.mjs export \
  --input tools/workflow-owned-extensions/fixtures/inputs/fitting-n45-page-change.json \
  --task-id n45-example-com \
  --subject n45-example-com-result \
  --sequence 1 \
  --clock 2026-09-09T08:00:00.000Z \
  --opt-in \
  --out /tmp/reuse-observation.json

node tools/workflow-owned-extensions/cli.mjs preview --consumer ghost \
  --input tools/workflow-owned-extensions/fixtures/inputs/fitting-n45-page-change.json \
  --task-id n45-example-com \
  --subject n45-example-com-result \
  --sequence 1 \
  --clock 2026-09-09T08:00:00.000Z

node tools/workflow-owned-extensions/cli.mjs register --store /tmp/woe-store --clock 2026-11-05T12:00:00.000Z
node tools/workflow-owned-extensions/cli.mjs update --store /tmp/woe-store --version 0.1.1 --clock 2026-11-05T12:05:00.000Z
node tools/workflow-owned-extensions/cli.mjs remove --store /tmp/woe-store --clock 2026-11-05T12:10:00.000Z
```

Fitting fixtures live under `fixtures/inputs/`. Retained outputs live under
`fixtures/outputs/`. A marketing-email JSON fixture is the non-fitting case:
the package returns a useful direct result-reuse CLI route instead of forcing
the Dify tool.

## Offline unit checks

This package uses Node builtins plus the existing `tools/result-reuse` SDK.
No extra npm package is required for the unit tests. Do not install a Dify or
Ghost stack to satisfy `test/*.test.mjs`, and do not treat generated manifests
as installation or as proof that a runtime ran.

```bash
node --version   # expect v22.x, the repo engine
node --test --test-concurrency=1 tools/workflow-owned-extensions/test/*.test.mjs
```

Optional CLI readback after the suite:

```bash
node tools/workflow-owned-extensions/cli.mjs manifests
```

## Ghost runtime on a Cursor VM

`runtime/run-runtime.sh` is the remote install/start/acceptance script. It is
idempotent, bounded, and model-free. It bootstraps a task-local pnpm 11.28.11
under `$ROOT/toolchain` (needed because Ghost 6.75.0 pins pnpm 12.16.1 and
ghost-cli 1.34.1 will not install that pin with a PATH pnpm older than
11.10.0), prepends that `.bin` to PATH for `ghost install` only, writes
`$OUT/runtime-preflight.json` before the install, then installs Ghost 6.75.0
under `$ROOT/runtime-home`, starts it on localhost, runs
`test/runtime/acceptance.mjs` (excluded from the default unit-test glob),
records timings, writes `EXITS.txt` and `SHA256SUMS`, and stops Ghost at the
end. The Admin API key stays in a 0600 file under `$ROOT/runtime-home`.

```bash
ROOT=<workdir> \
OUT=<outdir> \
TIP=<full-sha> \
BRANCH=codex/n7-workflow-extensions-20261105 \
  bash tools/workflow-owned-extensions/runtime/run-runtime.sh
```

Expected `EXITS.txt` names: `runtime_preflight`, `runtime_install`,
`runtime_start`, `runtime_acceptance`, `unit_tests`, `cli_manifests`. The
existing keys keep their meaning. `runtime_preflight` is written before
`ghost install` and is non-zero when node, the task-local pnpm, ghost-cli,
or free disk does not match. The VM needs node >= 22.23.1 (or >= 24.20.0)
and network access to npm. The script uses no sudo and makes no global
toolchain change. A VM output file may write `runtime-executed`. Committed
manifests do not.

The writer branch is `codex/n7-workflow-extensions-20261105`, based on the
consumer tip of `codex/h136010-machine-release-20261103`. A later draft PR
should target that consumer branch, not default main.
