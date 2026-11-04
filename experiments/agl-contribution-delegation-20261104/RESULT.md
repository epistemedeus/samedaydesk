# AGL contribution delegation prototype result

Branch: `cursor/agl-contribution-delegation-20261104`

Starting ref: `0593026ad155352f263e4749dc889a1578d91675`

PR base: `codex/h136010-machine-release-20261103` (that ref was the same commit as the starting ref when this branch was created)

Draft PR: pending until the pull request is opened

Commit identity: this report is committed with the prototype. The branch head SHA and tree SHA are printed from `git rev-parse HEAD` and `git rev-parse HEAD^{tree}` after the final push. A later identity commit, if present, only records the pull request number and the prototype commit. It does not change the harness.

## Files added

Byte counts below are for the files other than this report. This report's own byte count is measured after the text is stable.

- `experiments/agl-contribution-delegation-20261104/README.md`: 5301
- `experiments/agl-contribution-delegation-20261104/inputs.mjs`: 7612
- `experiments/agl-contribution-delegation-20261104/harness.mjs`: 22285
- `experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs`: 10838
- `experiments/agl-contribution-delegation-20261104/RESULT.md`: 007035

## Commands

An earlier host run failed before the passing commands below. The account-name query used an unqualified `journey_accounts` relation. The harness now reads `cj227_earned_work.journey_accounts`. That failed run:

```
node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs
```

Exit code 1.

```
# tests 4
# suites 0
# pass 3
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 7026.475692
```

Passing prototype command:

```
node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs
```

Exit code 0.

```
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6868.58672
```

Unchanged regression command:

```
node --test --test-concurrency=1 server/scripts/test-h133010-accepted-work.mjs
```

Exit code 0.

```
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12955.718649
```

Both runs used the disposable loopback host and a disposable local PostgreSQL 16 cluster. No hosted database, production endpoint, deploy, signer, or spend was used.

## What H-A showed

Synthetic contributor B delivered an accepted roster-rename artifact for implementation X. Synthetic requester A granted it, with explicit CC0 rights, to synthetic requester C. C exported the artifact and applied it to a changed roster row, `SYN-Y-441`, which is not the artifact's sample row and not an installed fixture. The applied fields were `workerId SYN-Y-441` and `windowLabel late`. The extra field `dock` stayed unmapped.

C posted implementation Y and recorded that handback with `useVoluntary`. The lost response returned exit 2, `unknown_outcome`, next action `readback`. `readbackVoluntary` recovered the same artifact digest. The host drop on `useVoluntary` stayed armed during readback, so the recovery did not POST `useVoluntary` again. Idempotency grew by one on the lost POST and stayed there. `downstream_use` stayed at one. The measure is `authenticated_self_report` with `independence: unknown` and `paidWork: false`.

Withdrawal then stopped later retrieval: export and a later use both returned `voluntary_withdrawn`, the consumer grant count was 0, and the requester inspect returned `evidence: null`.

Refusals on this path: stranger export `forbidden`, contributor grant `requester_required`, export before grant `forbidden`, stranger use `forbidden`. Private title, private summary, and a `requesterId` key returned `private_field_refused` from the installed publication checker. Missing publication consent returned `publication_consent_required`. The checker ran on a clone. The stored voluntary JSON was unchanged. `GET /v1/market/accepted-work` and `POST /v1/market/permitAcceptedWork` returned 404. Accepted-work discovery, retrieval, and continuation measures stayed 0. `acceptedWorkPublic` stayed off.

## What H-B showed

Synthetic requester A posted a dock-handoff need. Synthetic contributor B expressed interest. A read that interest, offered with explicit rights, B delivered a second artifact, and A accepted it on the unfunded profile. Export was not authorized. A later grant returned `voluntary_export_not_authorized`. Missing request consent returned `independent_role_required`. Missing share consent returned `contributor_consent_required`. A stranger review returned `forbidden`. A contributor interest read returned `requester_required`.

The installed fee module computed a platform fee and the run stored no fee event. Gross atomic `2500000`, rail cost `0`, platform fee atomic `125000`, contributor net atomic `2375000`, fee basis 500 bps, rounding profile `commerce-payments-v1.1.0-single-capture`. `exactFivePercentAtEveryAtomicAmount` is false. This particular amount is an exact five percent. `persisted`, `moneyMoved`, and `settlementSubmitted` are false. The delegation task has zero quote rows. `fund` returned `qualified_selection_required` with `paidWork: false`.

## What they cannot establish

No outside use, network effect, or revenue is implied. The accounts are synthetic and were created only on the disposable host. H-A's one handback is a self-report by one later synthetic consumer, not retained outside demand. H-B's pair is not a non-Pilot requester/provider pair, and the computed fee is not revenue. Wallet submission calls were 0. `signerAuthority` stayed false. The financial snapshot, quote count, funding count, capture count, and wallet count were unchanged. No live settlement occurred.

## Live metrics

- H-A: distinct later consumer use per accepted artifact. This run observed one `downstream_use` from one synthetic later consumer on one accepted artifact.
- H-B: non-Pilot requester/provider pairs and fee events. This run observed zero non-Pilot pairs and zero persisted fee events. It observed one synthetic pair and one unsent fee calculation.

## Open questions for Root

1. Activation of a public accepted-work route is a separate reviewed process. This prototype leaves `acceptedWorkPublic` unset and public reads off. Which outside consent and which useful sample would have to exist before that flag is passed on a regenerated profile?
2. The H-A live metric needs a later consumer who is not the accepting party. Which account provenance would count as outside Pilot?
3. A live H-B fee event requires the existing qualified quote and capture path, which can move money. Which funded receiving would have to finish before any such event is admitted?
4. Withdrawal stops later retrieval and later use recording. It does not claw back CC0 bytes already exported. Is that the retention rule activation should keep?
5. The disposable host signer stays false and no settlement row changes. Which additional check should precede any later signer or settlement admission?
