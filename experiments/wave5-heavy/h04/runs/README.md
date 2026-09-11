# H04 runs — persisted engine evidence

These files are **byte-identical copies** of real CLI `--out-dir` / stdout captures.
Engines were not rewritten. This tree is the PR-owned evidence; original tmp dirs are not in git.

Harness child output under `runs/engine-smoke/` and `runs/h04-*/` is **not** overwritten here.

## How artifacts were produced

Read-only worktrees (chmod a-w). Node v22.22.2. Date: 2026-09-11.

| Family | Worktree | SHA (40) | CLI |
| --- | --- | --- | --- |
| SDS52 wrapper | `/tmp/w5-h04/ro-sds52` | `aeef964fa188443078958d9d6d393afae1d542ee` | `server/paid-useful-jobs/bin/cli.mjs` |
| json-schema-webhook-drift | `/tmp/w5-h04/ro-w4-schema` | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | `tools/json-schema-webhook-drift/bin/webhook-drift.mjs` |
| lockfile-pin-delta | `/tmp/w5-h04/ro-w4-lockfile` | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | `tools/lockfile-pin-delta/bin/lockfile-delta.mjs` |
| route-table-diff | `/tmp/w5-h04/ro-w4-routes` | `7387eb677abd442dfab9081cb0ad95451fd2a762` | `tools/route-table-diff/bin/route-diff.mjs` |
| page-change-offline-job | `/tmp/w5-h04/ro-w4-pages` | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | `tools/page-change-offline-job/bin/page-change.mjs` |

`--out-dir` was always **outside** the RO worktree (`/tmp/w5-h04/h04-child-*-runs/` or `/tmp/w5-h04/h04-engine-smoke/`).

## SAMPLE vs customer

| Tree | Label |
| --- | --- |
| `runs/examples/` | **Caller-owned** before/after pairs. Not W4 kit SAMPLE fixtures. `sample=false` on observed briefs (route-02 `sold=false`). **Not a customer sale.** |
| `runs/inventory-smoke/` | **SAMPLE / `--example` inventory smoke. Not a customer job.** |
| `runs/inventory-engine-out/` | **SAMPLE / `--example` engine `--out-dir` (json/md/receipt). Not a customer job.** Page-change `--example` refused (`sample_as_delivered_watch`); `journey` analog is also not a customer job. |

Customer (non-SAMPLE, settling) jobs were not run. `purchaseAuthority` stayed false.

## Layout

- `examples/schema-webhook/<id>/` — copy of `/tmp/w5-h04/h04-child-schema-runs/<id>/`
- `examples/lockfile/<id>/` — copy of `/tmp/w5-h04/h04-child-lock-runs/h04-lock-*` (**skipped** `extract/` bulk lock dumps)
- `examples/page-facts/<id>/` — copy of `/tmp/w5-h04/h04-child-page-runs/<id>/`
- `examples/api-routes/<id>/` — copy of `/tmp/w5-h04/h04-child-route-runs/<id>/`
- `inventory-smoke/` — small stdout/stderr/exit copies from `inventory/smoke/` (none were huge)
- `inventory-engine-out/<engine>/` — json/md/receipt from `/tmp/w5-h04/h04-engine-smoke/` (`agenda.ics` skipped)

Each copied example directory has `meta.json`: `{ sourceTmp, engineSha, files, copiedAt }`.

Byte sizes: `copied-from-children.json`.
