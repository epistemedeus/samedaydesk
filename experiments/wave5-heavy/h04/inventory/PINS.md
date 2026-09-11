# H04 engine pins (observed)

Repo: `epistemedeus/samedaydesk`. SHAs from `git -C <worktree> rev-parse HEAD` + `git cat-file -t` (all `commit`). Archive sha256 re-hashed from the tar.gz bytes.

## Worktrees

| Family | Worktree | SHA (40) | PR | CLI | Purpose |
| --- | --- | --- | --- | --- | --- |
| sds52-wrapper | `/tmp/w5-h04/ro-sds52` | `aeef964fa188443078958d9d6d393afae1d542ee` | 52 | `node server/paid-useful-jobs/bin/cli.mjs run <job-id>` | Paid non-settling wrapper around useful-jobs 1.0.0 archive |
| w4-schema-webhook | `/tmp/w5-h04/ro-w4-schema` | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | 59 | `node tools/json-schema-webhook-drift/bin/webhook-drift.mjs` | Used JSON Pointer drift (not OpenAPI / not api-upgrade-brief) |
| w4-lockfile | `/tmp/w5-h04/ro-w4-lockfile` | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | unknown | `node tools/lockfile-pin-delta/bin/lockfile-delta.mjs` | npm lockfile name+version+integrity delta (W4-commerce-11 / M03) |
| w4-routes | `/tmp/w5-h04/ro-w4-routes` | `7387eb677abd442dfab9081cb0ad95451fd2a762` | 64 | `node tools/route-table-diff/bin/route-diff.mjs` | SPA route catalog added/removed/changed (not shell writer) |
| w4-pages | `/tmp/w5-h04/ro-w4-pages` | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | unknown | `node tools/page-change-offline-job/bin/page-change.mjs` | Offline extract-batch field compare (W4-commerce-13 / M05) |

`unknown` PR = not in `SOURCE-SNAPSHOT.json` `sdsCommerceLeaves` and not printed as a PR number on the RECEIPT at that SHA.

## SDS52 jobs (same wrapper SHA)

| id | required | outputs | one-line |
| --- | --- | --- | --- |
| `api-upgrade-brief` | `--before --after --used` | `upgrade-brief.json/.md` | OpenAPI used-ops upgrade brief |
| `vendor-budget-impact` | `--before --after` | `budget-impact.json/.md` | Curated pricing-row delta (not lockfile) |
| `feed-agenda` | `--before --after` | `agenda.json` + `agenda.ics` | RSS/Atom agenda (not live deadlines) |
| `evidence-ci-annotation` | `--input` | `annotations.json/.md` | Unattested CI annotations |
| `listing-repair-packet` | `--input` | `repair-packet.json/.md` | Listing/route owner repair (not route-diff) |
| `repeat-job-record` | `--next-run` (`--input-root` opt) | `repeat-job.json/.md` | Next-run record (not a daemon) |

cwd for all SDS52 jobs: `/tmp/w5-h04/ro-sds52`. Sample flag: `--example` (never a sale). `--out-dir` also writes `receipt.json`.

## useful-jobs archive (from SDS52 `pins.mjs` + observed hash)

| Field | Value |
| --- | --- |
| path | `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz` |
| sha256 | `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| bytes | `2522418` |
| sourceCommit | `0e473974554de9bfdba90676b6d3d710c10a2671` |
| archiveFreeze | `318130daaf19490e2f8af7c23131b42fe20e6cde` |
| purchaseAuthority | false |

## W4 engines

| id | required | sample | outputs | not |
| --- | --- | --- | --- | --- |
| `json-schema-webhook-drift` | `--before --after --used` | `--example` | `drift-brief.json/.md` | OpenAPI; api-upgrade-brief; remote `$ref` |
| `lockfile-pin-delta` | `--before --after` | `--example` | `pin-delta.json/.md` | vendor-budget-impact; npm install/audit |
| `route-table-diff` | `--out-dir` (+ `--before/--after` unless `--example`) | `--example` | `route-diff.json/.md` | spa-route-shells write; homepage rewrite; public HTTPS |
| `page-change-offline-job` | compare: `--before --after --fields --out-dir` (clock required) | `--example` **refuses** (`sample_as_delivered_watch`); use `journey` | `page-change.json/.md` | live fetch; payment retry; merchant `compare.mjs` |

cwd = the matching worktree root. Write `--out-dir` under `/tmp/w5-h04/h04-engine-smoke/<id>`, never into the RO worktree.
