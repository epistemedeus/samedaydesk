# Workflow-owned extensions

Source-only package that embeds the existing SameDayDesk `result-reuse`
capability in one supported workflow runtime and one second consumer adapter.

- Runtime embedding: Dify tool interface (`preview_reuse`, `export_reuse`,
  `decide_or_reuse`).
- Second consumer: Ghost unpublished-draft projection. It does not publish,
  register a webhook, or call the Ghost Admin API.
- Capability: `tools/result-reuse` (read-only import of the existing SDK and
  schema). Merchant cores are not copied or modified.
- Status: `installationStatus` stays `source_only_not_installed`.
  `runtimeExecutionStatus` stays `not yet executed on runtime`.
- When Dify or Ghost is unavailable, execution uses the existing local
  result-reuse CLI and SDK. That direct path is the useful fallback, not a
  claim that a workflow runtime ran.

This package does not add a catalog, host uploaded code, or change files
outside `tools/workflow-owned-extensions/`.

## Why Dify, and why Ghost second

Dify is the best first runtime because Pilot already maintains a packaged Dify
recipe (`dify-table-csv` 0.1.2) with a documented tool and workflow import
interface. E02 asks for a new useful downstream Dify embedding rather than
another installation of that table-csv recipe. Result-reuse gives a Dify author
preview, export, and decide-or-reuse of already produced page-change,
extract-batch, and record results, including public synthetic fixtures.

Ghost is the second consumer because E03 and the retained Ghost archive work
already treat Ghost as a real downstream package surface. The adapter projects
a reused observation into an unpublished draft shape. It does not install a
Ghost integration or rewrite hosted archives.

Native Tasks remains wire-only without a durable TaskStore, so it is not the
first runtime here.

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

## Remote VM checks

This package uses Node builtins plus the existing `tools/result-reuse` SDK.
No extra npm package is required. Do not install a Dify or Ghost stack to
satisfy these tests, and do not treat generated manifests as installation.

```bash
node --version   # expect v22.x, the repo engine
node --test --test-concurrency=1 tools/workflow-owned-extensions/test/*.test.mjs
```

Optional CLI readback after the suite:

```bash
node tools/workflow-owned-extensions/cli.mjs manifests
```

The writer branch is `codex/n7-workflow-extensions-20261105`, based on
`9f6c0c4e396dd7677f334400eed93e3445fad600` from
`codex/h136010-machine-release-20261103`. A later draft PR should target that
consumer branch, not default main.
