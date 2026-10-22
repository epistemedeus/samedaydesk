# useful-jobs (seeded fixture)

Seeded map copy of useful-jobs surfaces. MCP is not documented here.

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
