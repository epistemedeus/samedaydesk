# H04 inventory child receipt

Inventory of SDS52 paid wrappers + four W4 commerce engines. Read-only worktrees only. No engine rewrite. No W4 fixtures copied into h04 as corpus. No commit/push/PR.

## Verified SHAs

`git -C <worktree> rev-parse HEAD` and `git cat-file -t HEAD` (all `commit`):

| Worktree | SHA | type | PR |
| --- | --- | --- | --- |
| `/tmp/w5-h04/ro-sds52` | `aeef964fa188443078958d9d6d393afae1d542ee` | commit | 52 |
| `/tmp/w5-h04/ro-w4-schema` | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | commit | 59 |
| `/tmp/w5-h04/ro-w4-lockfile` | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | commit | unknown |
| `/tmp/w5-h04/ro-w4-routes` | `7387eb677abd442dfab9081cb0ad95451fd2a762` | commit | 64 |
| `/tmp/w5-h04/ro-w4-pages` | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | commit | unknown |

Fetch not required: every requested SHA was already HEAD of its worktree.

Lockfile/pages PR numbers: not in `SOURCE-SNAPSHOT.json` `sdsCommerceLeaves`; RECEIPTs at those SHAs have compare URLs, not observed PR numbers. Left unknown.

## Archive pin (observed, not just kit JSON)

`client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz` at SDS52 HEAD:

- sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`
- bytes `2522418`

Matches `pins.mjs` / `usefulJobsKit.json`.

## Smoke

Node `v22.22.2`. Commands in `INVOCATION.md`. Captures in `inventory/smoke/`. `--out-dir` under `/tmp/w5-h04/h04-engine-smoke/<id>`.

| id | sha | --example |
| --- | --- | --- |
| api-upgrade-brief | aeef964fa188443078958d9d6d393afae1d542ee | ran exit 0, sample=true sold=false |
| vendor-budget-impact | aeef964fa188443078958d9d6d393afae1d542ee | ran exit 0, sample=true sold=false |
| feed-agenda | aeef964fa188443078958d9d6d393afae1d542ee | ran exit 0, sample=true sold=false |
| evidence-ci-annotation | aeef964fa188443078958d9d6d393afae1d542ee | ran exit 0, sample=true sold=false |
| listing-repair-packet | aeef964fa188443078958d9d6d393afae1d542ee | ran exit 0, sample=true sold=false |
| repeat-job-record | aeef964fa188443078958d9d6d393afae1d542ee | ran exit 0, sample=true sold=false |
| json-schema-webhook-drift | 94c7bfdfeaa99f5e70f341504df3051cc7717f91 | ran exit 0, sample=true customerBrief=false |
| lockfile-pin-delta | e81efc8ab71b1bde88eca743d297149e61bbb6f2 | ran exit 0, provenance=fixture |
| route-table-diff | 7387eb677abd442dfab9081cb0ad95451fd2a762 | ran exit 0, sample=true publishedRouteTable=false |
| page-change-offline-job | 91b57334818ecd7940cb854e9864f3b1749d1d1d | ran **refuse** exit 2 `sample_as_delivered_watch` (designed). `journey` analog exit 0 verdict=changed |

`--help` exit 0 for wrapper + all four W4 CLIs.

Non-failures: route-table-diff `--example` stderr is Node `NO_COLOR` ignored because `FORCE_COLOR` is set — not an engine refuse.

## Failures / unknown

- W4-commerce-11 and W4-commerce-13 GitHub PR numbers: unknown (not claimed).
- Nested `distribution-repair` / OpenAPI-impact refuse codes inside the useful-jobs vendor tarballs: not fully enumerated (pass-through `engine-refused` / engine `code`).
- Customer (non-SAMPLE) jobs were not run.

## Files written (owned dir only)

- `experiments/wave5-heavy/h04/inventory/ENGINES.json`
- `experiments/wave5-heavy/h04/inventory/PINS.md`
- `experiments/wave5-heavy/h04/inventory/INVOCATION.md`
- `experiments/wave5-heavy/h04/inventory/RECEIPT.md`
- `experiments/wave5-heavy/h04/inventory/smoke/*` (real stdout/stderr/exit)
