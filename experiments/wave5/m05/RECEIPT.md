# RECEIPT — W5-M05 Co13 bounded page-change analysis

Assignment: W5-M05. Repo: `epistemedeus/samedaydesk`.
Branch: `cursor/w5-m05-co13-bounded-page-change-analysis-266c`
Starting ref: `91b57334818ecd7940cb854e9864f3b1749d1d1d`
Head: `9fb60dd1e3852ce44a23a9064d40cdbf0d24780d`
Engine: `samedaydesk.page-change-offline-job@0.1.1`
Node: v22.14.0
Date: 2026-09-11

## Outcome

Reproduced the Co13 source prediction on the public CLI: `diffJson` never set `truncated` at `maxChanges` (`>` vs a walk that stops at `>=`), so a cut change list still claimed `complete=true`. `maxJsonDepth` / `maxJsonNodes` lived in defaults but were unused; `--max-json-depth` was `usage`. `--max-stale-ms` and the customer-job fixture `maxStaleMs: 86400000` were accepted and ignored (`freshness` stayed `unknown`). Source slicing left `snapshot.truncated` false.

Smallest fix: mark walk truncation, enforce depth/node during the selected-field walk, apply the observation horizon, and keep a detected semantic change as `verdict=changed` while `complete` / `noChangeProven` stay false. Display excerpt cuts stay display-only. Oversize files remain exit 2 `input_bounds` (input refusal, not incomplete analysis). Integer `termsVersion` still refused. Unlike terms schemas are not hashed equal.

## Pins tested this run

| Item | Value |
| --- | --- |
| Write repo / branch | epistemedeus/samedaydesk `cursor/w5-m05-co13-bounded-page-change-analysis-266c` |
| Co13 start | `91b57334818ecd7940cb854e9864f3b1749d1d1d` (read-only worktree) |
| PR52 wrapper | `aeef964fa188443078958d9d6d393afae1d542ee` read-only. Not imported. |
| Contract | `PAGE_CHANGE_OFFLINE_CONTRACT` / `samedaydesk.page-change-offline-job.contract.v1` |
| Report schema | `pilot/page-change-brief/v1` |
| Merchant compare.mjs | not imported |
| Payments | none |

## Tests

```sh
node --test --test-concurrency=1 tools/page-change-offline-job/test/*.test.mjs
```

**PASS** — 26 tests, 0 fail, 0 skipped. Node v22.14.0. Includes spawned `bin/page-change.mjs` process tests and the existing local HTTP URL-refusal (0 hits). Postgres is not a public interface of this job; the suite probes `127.0.0.1:5432` and does not skip-as-pass.

Journey: `verdict=changed`, `freshness=observed` from fixture `maxStaleMs`, `current=false` because coverage is incomplete, `usefulOutputProven=true`. Bounded: `--max-changes 2` → `changed` / `complete=false` / `limitsHit=["maxChanges"]`. Title text change survives sibling key-order normalization.

## Remaining integration binding

W5-M01. Catalog / PR52 wrapper / `sdd.page_change_offline` still point elsewhere. Consumers can bind `PAGE_CHANGE_OFFLINE_CONTRACT` and `bin/page-change.mjs` at engine `0.1.1`. This receipt does not claim future wrapper behavior.

pstack: marketplace plugin `0.15.1` (`cursor/plugins@68d834d9`). Bug-fix playbook plus principle skills read from cache. No extra Cloud agents. No `~/.cursor/rules/pstack-models.mdc`. Parent route: included Cursor Grok 4.6 xhigh.

No deploy, spend, payout, default-branch push, or customer messages.
