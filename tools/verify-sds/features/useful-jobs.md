# useful-jobs

Offline CLI from the public 1.4.7 archive. Caller files in, promised json+md
out. `purchaseAuthority` stays false. Hosted extract on `/for-agents` is a
separate product and is not started by these jobs.

| field | value |
| --- | --- |
| goal | exact caller files → promised json+md |
| entrypoint | extract archive `bin/useful-jobs.mjs`; page `/for-agents/useful-jobs` |
| command | `node tools/verify-sds/features/check-map.mjs --json` then archive acquire + `bin/useful-jobs.mjs list` |
| state | extracted 1.4.7 outside the repo; `purchaseAuthority:false` |
| tests | `npm run test:useful-jobs-public` |
| prerequisite | Node 22; archive acquire 1.4.7 (5255824 bytes, sha `e2e9b44e…69dec`) |

## Surfaces

| id | kind | repo / public |
| --- | --- | --- |
| `useful-jobs.page` | page | `client/src/pages/UsefulJobs.tsx` · `/for-agents/useful-jobs` |
| `useful-jobs.spa-history` | route | `server/lib/spa-fallback.js` · `client/src/App.tsx` |
| `useful-jobs.shell` | shell | `client/src/data/machineEntry.mjs` · `server/lib/spa-route-shells.js` |
| `useful-jobs.discovery` | machine | `/discovery/useful-jobs.json` |
| `useful-jobs.catalog` | machine | `/for-agents/useful-jobs/catalog.json` |
| `useful-jobs.outcomes` | machine | `/for-agents/useful-jobs/jobs-outcomes.json` |
| `useful-jobs.kit.json` | pin | `client/src/data/usefulJobsKit.json` |
| `useful-jobs.archive.1.4.7` | archive | `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz` |
| `useful-jobs.kit-archive.1.4.7` | archive | `/kit/useful-jobs-1.4.7.tar.gz` |
| `useful-jobs.obtain` | cli | `experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs` |
| `useful-jobs.cli` | cli | `bin/useful-jobs.mjs` (inside extracted archive) |
| `useful-jobs.jobs.lockfile-pin-delta` | job | lockfile pins → `pin-delta.json` + `.md` |
| `useful-jobs.jobs.json-schema-webhook-drift` | job | JSON Schema used-paths → `drift-brief.json` + `.md` |
| `useful-jobs.jobs.route-table-diff` | job | route catalogs → `route-diff.json` + `.md` |
| `useful-jobs.jobs.page-change-offline-job` | job | held extract-batch JSON; no `--example` |
| `useful-jobs.jobs.api-upgrade-brief` | job | OpenAPI used-ops → `upgrade-brief.json` + `.md` |
| `useful-jobs.jobs.vendor-budget-impact` | job | pricing snapshots → `budget-impact.json` + `.md` |
| `useful-jobs.jobs.feed-agenda` | job | RSS/Atom delta → `agenda.json` + `agenda.ics` |
| `useful-jobs.jobs.evidence-ci-annotation` | job | evidence packet → `annotations.json` + `.md` |
| `useful-jobs.jobs.listing-repair-packet` | job | listing snapshot → `repair-packet.json` + `.md` |
| `useful-jobs.jobs.repeat-job-record` | job | next-run record → `repeat-job.json` + `.md` |
| `useful-jobs.archive.1.1.0` | negative-control | `/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz` |

## Sub-features

- `list` returns ten job ids from `catalog.json` (schema `useful-jobs.catalog.v1`, version 1.4.7).
- Newly reviewed in 1.4.7: `lockfile-pin-delta`, `json-schema-webhook-drift`, `route-table-diff`, `page-change-offline-job`, `vendor-budget-impact`.
- Inherited without a new review: `api-upgrade-brief`, `feed-agenda`, `evidence-ci-annotation`, `listing-repair-packet`, `repeat-job-record`.
- `page-change-offline-job` has no `--example`; `--example` is `sample_as_delivered_watch`.
- Missing required inputs must refuse (product does not invent files).
- Immutable archives 1.0.0–1.4.0 stay on disk; 1.1.0 is the required negative control.

## How to get to it (user POV)

- Open `/for-agents/useful-jobs`.
- Read machine discovery at `/discovery/useful-jobs.json`.
- Download `/kit/useful-jobs-1.4.7.tar.gz` or `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`.
- Verify 5255824 bytes and sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`.
- Extract outside the checkout and run `node bin/useful-jobs.mjs list`.

## Driving it from this map

Preconditions:

- Node 22.
- Dest/extract dirs not inside this git tree.
- Do not fetch live apex if the VM is CDN-challenged; use committed public files.

- **Map coverage.** `node tools/verify-sds/features/check-map.mjs --json`. Exit 0. `result.families` includes `useful-jobs`.
- **Acquire.** `node experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs` against the committed 1.4.7 tarball, dest outside the repo.
- **List.** `node bin/useful-jobs.mjs list` on the extract. Ten ids.
- **Seeded missing surface.** `node tools/verify-sds/features/check-map.mjs --seed missing-surface --json` must not be treated as useful-jobs success; it is an MCP-family reject.

## Gotchas

- Catalog `ownedPath` values such as `tools/lockfile-pin-delta/` are **absent in this repo**; the engines live in the archive.
- Inner README may still title an older 1.4.x; package/pin is 1.4.7.
- Do not treat a green `test:useful-jobs-public` as substitute for `bin/useful-jobs.mjs list` after a cold extract.
- `obtain-archive.mjs` currently prints `ok:false` and **exit 0** on digest mismatch. A verifier must remap that to nonzero.
- Acquire tools (bash, curl, python3, tar, mktemp) are host utilities for download/verify/extract only. Runtime after extract is Node >= 22, offline.
