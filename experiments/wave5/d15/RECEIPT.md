# W5-D15 RECEIPT — input/execute race harness

**Date:** 11 September 2026
**Assignment:** W5-D15
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d15-deterministic-input-execute-race-harness-4fc6`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/75
**Owned path:** `experiments/wave5/d15/`

## Tested pins

| Role | SHA |
| --- | --- |
| Product kernel `execution.v1` | `e2f951cae7bb299df2283b9c181bb0d369fc26af` (read-only worktree) |
| Previous D01 kernel | `6bed72dd22a396134aa5c957933b42c3a5746698` |
| Negative baseline SDS52 | `aeef964fa188443078958d9d6d393afae1d542ee` |

Freeze-shim `--bind frozen` is **not** product acceptance.

## Product evidence

Recorded after `node --test experiments/wave5/d15/test/*.test.mjs` on this revision.

No homepage, wrapper, spend, or deploy in this PR.
