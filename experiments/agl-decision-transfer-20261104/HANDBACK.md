# AGL-DECISION-TRANSFER handback

Owner: Pilot Agent Growth Loops. Receiver: AGL. Root integrates.

Branch: `codex/agl-decision-transfer-20261104`

Base: `8585c15965296938d83424f9622923c1cda7f8ad` (PR357, N4-WORKFLOW-DISTRIBUTION). That branch was not moved.

Implementation commit: `849661e4e11a9e07f840389d71a540fbe76b979d`

Implementation tree: `e5b04c030ee9f7f8b174bbd735f011ea98c274b6`

Head: the child commit that updates this file and the N4 notes. A file cannot contain the hash of the commit that adds it. `git rev-parse HEAD` on this branch is the current head. Its tree is `git rev-parse HEAD^{tree}`.

Pull request: draft https://github.com/epistemedeus/samedaydesk/pull/358 into `codex/n4-workflow-distribution-20261104`. The diff against PR357 shows the horizon fix. No pull request into PR356's branch `codex/nov04-qualified-reuse-integration`.

## What ran

Synthetic requester A produces the harbor catalog decision with the existing workflow. The bound identity now includes `horizonHours`, so `result.transfer.command` carries `--horizon` `168`.

Contributor B delivers that observation, the before-work manifest, and the prepared command as voluntary evidence under the existing CC0 rights shape. Requester A reviews it with export authorized and grants it to requester C. C exports the same bytes.

C runs the exported command in a separate process. The only filled placeholder is `<the same before-work manifest>`. `bound-observation.json` stays the relative artifact name. Inside that process the source-change-alert recipe and `tools/recurring-job-recipes/cli.mjs` are bind-mounted to `/dev/null` (both read back as 0 bytes). An exec trace sees `result-reuse/cli.mjs` and does not see the producer executed. The verdict is `reuse`, `producerInvoked` is false, and the outcome is `unchanged`.

A changed manifest returns `recompute` with reason `digest_mismatch`. The producer is still hidden and is not executed.

A copy of the observation with a `password` field is rejected by `decide-or-reuse` before a useful decision is returned (`verdict` `rejected`, reason `private_field`). That secret is not in the granted evidence.

The disposable host is loopback `server/scripts/root10940-machine-host.mjs`, participation on, `acceptedWorkPublic` false, unfunded `voluntary-artifact-v1`. Its profile has no `acceptedWork`. Its accepted-work GET is 404.

Recorded cases:

- Export before the grant is `forbidden`. A contributor grant is `requester_required`. Stranger export and stranger use are `forbidden`.
- `useVoluntary` is committed once. The response is dropped (`unknown_outcome`, next `readback`). Readback recovers it. A second POST is blocked with `operation_readback_required` and does not add a row. The measure is `authenticated_self_report`, independence `unknown`, `paidWork` false.
- After `withdrawVoluntary`, later export and use are `voluntary_withdrawn`. The consumer row count is 0.
- `fund` stays refused with `qualified_selection_required`. Quotes, funding, captures, wallets, and the financial snapshot are unchanged. Wallet calls are 0.

## Live public state

The earlier read at 2026-11-04T22:42:34Z and 2026-11-04T22:42:35Z is still the field-level record. It is not the disposable-host source default.

`GET https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/profile` returned 200. `value.acceptedWork` was present: schema `pilot.machine-market.accepted-work-publication.v1`, publicReads `0`, paidWork false, signerAuthority false, discovery `/v1/market/accepted-work`. `value.capability.money` was `unfunded`. Participation was `voluntary-artifact-v1`. `value.signerAuthority` was false. `x-ae-server-class` was `live`.

`GET https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/accepted-work` returned 200: items `[]`, nextCursor null, acceptedWorkPublic true, publicReads `0`, paidWork false, signerAuthority false.

This journey read both URLs again and observed profile 200 with `acceptedWork` present, money `unfunded`, participation `voluntary-artifact-v1`, and accepted-work 200. The disposable host stayed `acceptedWorkPublic` false.

## Changed paths

`experiments/n4-workflow-distribution-20261104/`:

- `src/journey.mjs`
- `test/journey.test.mjs`
- `HANDBACK.md`
- `RESULT.md`

`experiments/agl-decision-transfer-20261104/`:

- `README.md`
- `HANDBACK.md`
- `harness.mjs`
- `reuse-child.mjs`
- `test/decision-transfer.test.mjs`

No shared file under `vendor/`, `tools/result-reuse/`, or `experiments/agl-contribution-delegation-20261104/` was edited.

## Tests

```sh
node --test --test-concurrency=1 experiments/agl-decision-transfer-20261104/test/decision-transfer.test.mjs
```

Exit code 0.

```
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6019.402703
```

```sh
node --test --test-concurrency=1 experiments/n4-workflow-distribution-20261104/test/journey.test.mjs
```

Exit code 0. 7 tests, 7 passed, 0 failed, duration_ms 3572.020693.

```sh
npm run test:result-reuse
```

Exit code 0. 37 tests, 37 passed, 0 failed, duration_ms 795.553197.

```sh
node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs
```

Exit code 0. 4 tests, 4 passed, 0 failed, duration_ms 6433.612348.

```sh
node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/handback-row-decision.test.mjs
```

Exit code 0. 1 test, 1 passed, 0 failed, duration_ms 155.674379.

```sh
node --test server/scripts/test-h133010-accepted-work.mjs
```

Exit code 0. 2 tests, 2 passed, 0 failed, duration_ms 13382.522981.

## Normal next-use command

```sh
node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs install --state /tmp/n4-workflow-distribution --clock 2026-11-04T22:00:00.000Z
node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs run --state /tmp/n4-workflow-distribution --input experiments/n4-workflow-distribution-20261104/fixtures/case.json --out /tmp/n4-workflow-distribution/out
```

The prepared command is `result.transfer.command`. For this case it is `decide-or-reuse` with `--horizon` `168`, `--decision` `bound-observation.json`, and `--input` set to the same before-work manifest. It was not sent. The journey above is the author running it after a synthetic grant.

## Next consumer

A non-Pilot grantee. Unknown. Synthetic requester C in this disposable host is not that grantee. This author's runs are not independent use. No savings claim is made. `distinctLaterAcceptedTasksTakingReuse` is null. `recomputeCostAvoidedNetOfUpkeep` is `costs_unknown`. The recorded `useVoluntary` row is `authenticated_self_report` with independence `unknown`.

## Unknowns

- Whether a later non-Pilot grantee exists. Unknown is not zero.
- Net recompute cost avoided, after upkeep. `costs_unknown`.
- Byte equality with private `epistemedeus/neomorphic-io` remains unknown from the received N4 record.
