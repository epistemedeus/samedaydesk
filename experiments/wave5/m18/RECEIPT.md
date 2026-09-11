# RECEIPT — W5-M18 reproducible changed-page trial

Tool: `experiments/wave5/m18/`
Date: 2026-09-11
Node: v22.14.0
Write branch: `cursor/w5-m18-reproducible-changed-page-trial-7467`
Starting ref: `aeef964fa188443078958d9d6d393afae1d542ee` (SDS52 / PR52)

## Outcome

Thin consumer of the pinned SDS-local page-change CLI. A useful changed fact is checked against captured extract-batch bytes. Capture freshness is evaluated at the query clock. Engine `claims.fresh` stays false at this pin. No fetch, pay, merchant kernel, catalog, or homepage edit.

## Pins tested

| Item | Value |
| --- | --- |
| Engine | W4-commerce-13 `91b57334818ecd7940cb854e9864f3b1749d1d1d` `tools/page-change-offline-job/bin/page-change.mjs` |
| SDS52 | `aeef964fa188443078958d9d6d393afae1d542ee` |
| Published before sha256 | `23833bf7b28ca27a074cb9d73daaa2ec3beed14a55d767567c5fab50b66605f4` |
| Published after sha256 | `a7fdf95f161c67529a7254b1d2e1c4efa068506ac01edaee3c2561a5d09c9bd6` |
| Report schema | `pilot/page-change-brief/v1` |
| Trial schema | `samedaydesk.wave5.m18.changed-page-trial.v0` |
| Postgres | `127.0.0.1:5432` `ECONNREFUSED`; no SQL interface |

## Literal journey

```sh
# Engine pin via git worktree or PAGE_CHANGE_ENGINE_ROOT
node experiments/wave5/m18/bin/trial.mjs run \
  --case complete-changed \
  --out-dir /tmp/m18-complete

# Published SDS52 snapshots (widget deadline moved)
node experiments/wave5/m18/bin/trial.mjs run \
  --case published-customer-job \
  --out-dir /tmp/m18-published
```

## Tests

```sh
node --test --test-concurrency=1 experiments/wave5/m18/test/*.test.mjs
```

Recorded after execution in this worker.

## Honesty

No deploy, purchase, live payment, account change, or customer messages. SameDayDesk / EIN.LLC / Neomorphic homepages untouched. No Other-pool models. No default-branch push.
