# W5-D09 RECEIPT — Co03 repeat-job binder (frozen previous/current refs)

**Date:** 11 September 2026  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-d09-co03-repeat-job-binder-using-frozen-previous-current-input-references-22a5`  
**HEAD:** (set after commit)  
**Starting ref:** `7c55738cc5730985b709282af6c24e10f0a8442f`  
**Owned paths:** `tools/repeat-job-binder/`, `experiments/wave5/d09/RECEIPT.md`

## Outcome

Changed meaningful input is analyzed from frozen current bytes. Previous-run
output is refused as new work. Nonzero engine exit is a transport failure, not
`status: actionable`. Valid analysis `refused` / `no-change` is delivered, not
mislabeled as a crash.

## Source-only predictions reproduced at 7c55738

| Prediction | Observed on pin | Fix |
| --- | --- | --- |
| failed/nonzero adapter output can become actionable | Injected/fake CLI exit 1 with `{ok:true}` stayed `actionable` | `nonzero-engine-exit` refuse |
| reopened source paths | Engine argv used live `--after`; mutation after verify was visible | Freeze to `frozen-current/`, pass copies |
| unchecked next manifests | Bare next-run without `currentInputs` sha256 was actionable | `unchecked-next-manifest`; parser mismatch refuses |
| reused output paths | `--out-dir` of first run mixed `second-run.json` into the ticket dir; stale `engine/` files could be listed | `reused-output-path`; empty engine dir this run only |
| previous output reused as new work | `--after repeat-job.json` was actionable | `previous-output-reused` |

## Pins tested

| Artifact | Result |
| --- | --- |
| PR51 useful-jobs-1.0.0.tar.gz | 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| PR51 record-repeat-job-ab84d79b0272.tar.gz | 1253570 B, sha256 `9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea` |
| D01/PR52 wrapper | `aeef964fa188443078958d9d6d393afae1d542ee` `server/paid-useful-jobs/bin/cli.mjs` via `--paid-wrapper-bin` (read-only worktree; source not copied) |
| I01 hasher golden | `sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f` |

Binder terms schema `w5.repeat-job-binder.terms.v1` is not forced equal to I01 kernel terms.

## Tests

```bash
cd tools/repeat-job-binder
npm test
# 23 pass, 0 fail, 0 skipped. Node v22.14.0

SDS_D01_WRAPPER_BIN=<pr52-worktree>/server/paid-useful-jobs/bin/cli.mjs \
  npm run test:d01
# 1 pass, 0 fail. Pin aeef964. Not in default npm test (sibling tree is not on this branch).
```

Postgres: none in this package; not faked. Missing SQL is not a skipped green gate.

## Remaining integration binding

W5-D01 owns `server/paid-useful-jobs/`. This binder was tested against PR52
`aeef964fa188443078958d9d6d393afae1d542ee` as an injected CLI. D01 may amend
that wrapper. Default catalog path remains the PR51 useful-jobs CLI the
wrapper also runs. This package does not claim a future D01 export.

## Honesty

No default-branch push, deploy, spend, payout, or unsolicited messages.
Homepages and root manifests untouched. pstack: plugin cache
`9717366` skills `tdd`, `principle-prove-it-works`,
`principle-boundary-discipline`, `principle-sequence-verifiable-units`,
`typescript-best-practices` (no `.ts` in this package). Model from
cursor-cloud `run-info`: `cursor-grok-4.6-xhigh`. No `pstack-models.mdc`.
No extra Cloud agents.
