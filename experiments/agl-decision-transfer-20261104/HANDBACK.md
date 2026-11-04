# AGL-DECISION-TRANSFER handback

Owner: Pilot Agent Growth Loops. Receiver: AGL. Root integrates.

Branch: `codex/agl-decision-transfer-20261104`

Base: `8585c15965296938d83424f9622923c1cda7f8ad` (N4-WORKFLOW-DISTRIBUTION head, read-only). That branch was not changed.

Seam commit: `fa1d55a085565cd9ff58e06e1d3b2a38552151df`

Seam tree: `d5b6b42a40e6d261418443984026f8ffbb30d8a9`

Head when this report was first committed: `a1b3fe26f300d79011f2f49d2d4997d908653f0c`, tree `7e1ae104c7b6c22ed82df0c9dcfc8931693cad26`. A later commit adds the pull request URL below. `git rev-parse HEAD` on this branch is the current head.

Pull request: draft https://github.com/epistemedeus/samedaydesk/pull/358 into `codex/n4-workflow-distribution-20261104`. The diff is this directory. No pull request into PR356's branch `codex/nov04-qualified-reuse-integration`. A pull request into `codex/h136010-machine-release-20261103` would include PR356 and the N4 journey, so that base is not separable.

## Seam

The distinct-participant journey was not started. `result.transfer.command` from the harbor workflow is not executable.

`experiments/n4-workflow-distribution-20261104/src/journey.mjs` builds that command with `String(doc.horizonHours)` and calls it with `result.identity`. The identity stores `taskId`, `subject`, `sequence`, and `clock`. It does not store `horizonHours`. The prepared command therefore contains the token `undefined` after `--horizon`.

`tools/result-reuse/cli.mjs` rejects that token before it reads the saved decision:

```
{"ok":false,"message":"horizon requires a non-negative number of hours"}
```

The observed command, with placeholders still shown, is:

```
node tools/result-reuse/cli.mjs decide-or-reuse --input <the same before-work manifest> --decision bound-observation.json --task-id harbor-catalog-page --subject harbor-catalog-page-decision --sequence 1 --clock 2026-09-09T08:00:00.000Z --horizon undefined --opt-in
```

Filling the manifest placeholder and the decision path, then running the remaining tokens in a separate process, exits 1. No grant, export, `useVoluntary`, withdrawal, private-field grant, stranger check, or fund call was made on the disposable host. Shared code was not patched.

## Live public state

Read at 2026-11-04T22:42:34Z and 2026-11-04T22:42:35Z. These are the responses, not the disposable-host source default.

`GET https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/profile` returned 200. `value.acceptedWork` is present:

- schema `pilot.machine-market.accepted-work-publication.v1`
- publicReads `0`
- paidWork false
- signerAuthority false
- discovery `/v1/market/accepted-work`

`value.capability.money` is `unfunded`. `value.capability.participation` is `voluntary-artifact-v1`. `value.signerAuthority` is false. `value.capability` has no `acceptedWorkPublic` field. `x-ae-server-class` was `live`.

`GET https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/accepted-work` returned 200:

- items `[]`
- nextCursor null
- acceptedWorkPublic true
- publicReads `0`
- paidWork false
- signerAuthority false

The disposable host source default with `acceptedWorkPublic` false is a profile without `acceptedWork` and an accepted-work GET of 404. That default was not used as the public state. The host was not booted.

## Changed paths

No file outside `experiments/agl-decision-transfer-20261104/` was changed.

Seam commit:

- `README.md`
- `test/decision-transfer.test.mjs`

The following commit adds `HANDBACK.md`. A later commit records the draft pull request URL in this file.

## Tests

```sh
node --test --test-concurrency=1 experiments/agl-decision-transfer-20261104/test/decision-transfer.test.mjs
```

Exit code 1.

```
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 420.554222
```

```sh
npm run test:result-reuse
```

Exit code 0. 37 tests, 37 passed, 0 failed, duration_ms 691.665262.

```sh
node --test --test-concurrency=1 experiments/n4-workflow-distribution-20261104/test/journey.test.mjs
```

Exit code 0. 6 tests, 6 passed, 0 failed, duration_ms 3012.061049.

```sh
node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs
```

Exit code 0. 4 tests, 4 passed, 0 failed, duration_ms 6605.589628.

```sh
node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/handback-row-decision.test.mjs
```

Exit code 0. 1 test, 1 passed, 0 failed, duration_ms 170.719901.

```sh
node --test server/scripts/test-h133010-accepted-work.mjs
```

Exit code 0. 2 tests, 2 passed, 0 failed, duration_ms 13109.225878.

The first contribution and accepted-work attempts exited 1 before dependencies were present (`ajv` and `pg` missing, and PostgreSQL 16 was not on `PATH`). After `npm ci --ignore-scripts` and the PostgreSQL 16 client binaries, the counts above are the completed runs. Those installs are local to this machine. They are not commits.

## Normal next-use command

There is no working next-use command. The prepared command above is the one a later participant would run, and it exits 1 on `--horizon undefined`.

## Next consumer

A non-Pilot grantee. Unknown. This run did not create one. The author's failing process is not independent use. No savings claim is made. `distinctLaterAcceptedTasksTakingReuse` was not given a new value.

## Unknowns

- Whether a later non-Pilot grantee exists. Unknown is not zero.
- Net recompute cost avoided. Unknown.
- The disposable host journey, including producer absence under a grant, was not observed because the prepared command stops first.
- Byte equality with private `epistemedeus/neomorphic-io` remains unknown from the received N4 record.
