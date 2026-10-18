# ROOT255 entitled result on the current composition

The entitled read is the existing `GET /v1/review` with both `taskId` and `reservationId`. It does not pay, sign, import, or create a second obligation.

## Guards already present

`fromEarned` reads stored earned rows. It does not call the installed accepted-work validator.

`fromAccepted` calls `readAcceptedSource`. The configured SDS mount implements that callback as `installed.adapters.review.read`. That callback revalidates canonical terms, the frozen submission, and the signed verdict history. When an obligation is owed it also requires a pass verdict, `paid === false`, `transfer === null`, and matching reward and settlement. It does not read the Root registry, the canonical transfer, or `native_debt_dispositions`.

`createCanonicalReceiving` is a separate port. It calls `assertBinding`, checks the authoritative receipt digest, and its observer calls `readRailTransfer`. The entitled route did not call that port. Reporting a bypass inside `fromAccepted` would be false: that path already revalidates the accepted work.

The gap was `dispositionFor` treating the historical SQL projection (`import_state`, `kernel_paid`, `native_paid_observation`) as current fulfillment. A stored `native_paid` row and a currently verified fulfillment are separate facts.

The paid read now calls the same `assertBinding` canonical-receiving uses, then `storedDebt`, `readAuthoritativeDischarge`, and `readRailTransfer`. A miss is HTTP 409 `stale_evidence`. The historical row stays. It is not relabeled `owed` and it is not deleted. Accepted-unpaid, which has no disposition row, stays projection `owed`. A paused-Make refusal stays `businessStatus` `refused` with `usefulOutcome` null.

## Six controls

Each control is a failure, then a restore that passes again. Counts of dispositions, obligations, and accounts stay the same.

| Control | Break | Restored read |
| --- | --- | --- |
| Wrong source | Transfer topic and transaction sender | 200 `fulfillment.paid` true |
| Removed transfer log | `removed: true` | 200 |
| Changed authoritative receipt | Discharge artifact digest | 200 |
| Rejected verdict | Verdict `fail` | 200 |
| Changed terms | Terms reward amount | 200 |
| Missing Root registry | Discharge file absent | 200 |

Before the owner succession, the same paid read is 409 `stale_evidence`. No second payment is created.

## Upgrade

`installedSourceSha256()` hashes the packaged wallet files. A new file or packed archive changes it. `consumerContractSha256()` stays when `NATIVE_DEBT_CONSUMER` stays. The SDS host pin also lists those packaged bytes, so a vendor overlay changes `hostSourceSha256()` once the pin matches the new bytes. A pin that still names the old bytes fails closed with `binding_stale`.

The enrollment row is not updated or deleted. Root repeats empty-body `POST /v1/native-debt/enroll`. That appends `hosted_wallet_market.source_succession` with the enrolled source, the installed successor source, the successor host pin, the consumer contract, and the exact live disposition seal. A body that supplies `sourceSha256` is 400 `body_refused`. A later host-only move is 409 `enrollment_conflict` and `qualified` false until the authorized host bytes are restored. Rail, tenant, registry, and profile changes stay `enrollment_conflict`.

## Rollback

Unset the adapter mode or restore the previous artifact through the release controller. Keep `consumer_enrollment`, `native_debt_dispositions`, earned obligations, and the Root registry. Dropping only `source_succession` removes the successor record. Re-applying additive `006` recreates the empty table. The owner enrolls again. Do not `DROP SCHEMA`, `DELETE`, or `TRUNCATE` enrollment or obligations, and do not re-enroll from a caller baseline.

The payment notice is Sent-verified. That is not proof the recipient received it. This upgrade sends no notice.

## Portable input closure

Do not guess `/tmp/root71-pins/sds` or `/tmp/root71-sds-wt`. Those paths were absent for the first independent run.

```sh
export ROOT71_SDS_PIN=/home/ubuntu/ae14-work/root156-sds
export ROOT71_SDS_WORKTREE=/home/ubuntu/ae14-work/root156-sds
```

`ROOT71_SDS_WORKTREE` is the compiled owner at `2b8a9993f98bfe9c943d7ead90d29a84e1ed25cb` on `codex/root156-aged-review-runtime-20261017`. Read it. Do not edit it and do not interrupt that review-runtime family. `ROOT71_SDS_PIN` is the git object store that contains serving commit `e56c4d84f1c59f02307d5aa9a2c330957a28aa6d`.

Private composition base: SDS `3d360fb7818835f9832893f60d3aeb9b98b9ffea`, Neo `0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556`, vendored market origin `0c7551e6c6c27deb048922374e6fe52fa2825a67`. Pilot writer start: `252b829cc2d0554786e42f1b46699dc628289f16`.

Client unit inputs, from `/home/ubuntu/root254-cli-input-closure-20261018/INPUTS.json`:

- Funded continuation `9a4be4834b21ff7dbd8a9ce894dfa2c40eda675c` at `tools/ops/funded-continuation`.
- C contract requests `627d1b106127e72ead5cb23c8b1ee37913c4ed31`, blob `8fa1cf788c14d6fb8b0c4d47de5bcd0a58c6711d`.
- F1 remains `e16f7812c7eaa563c3effcbbbb99c8f42df3cdbc`. The unit dist path in that receipt is `/tmp/ae14-c-compose/tools/agent-economy-foundation/dist/index.js`.

The private profile already has a requester session. QA does not sign up again and does not reissue recovery. This session did not open that profile.

```sh
node --test tools/root71-hosted-wallet-market/test/retained-outcome.test.mjs
node --test tools/root71-hosted-wallet-market/test/preserve.test.mjs
node --test tools/root71-hosted-wallet-market/test/source-lineage.test.mjs \
  tools/root71-hosted-wallet-market/test/packed-client.test.mjs
ROOT71_SDS_PIN=/home/ubuntu/ae14-work/root156-sds \
ROOT71_SDS_WORKTREE=/home/ubuntu/ae14-work/root156-sds \
  node --test tools/root71-hosted-wallet-market/test/guard-recovery.test.mjs \
  tools/root71-hosted-wallet-market/test/native-debt.test.mjs
```

On the SDS candidate, from that worktree:

```sh
npm install --ignore-scripts --no-audit --no-fund --prefix vendor/hosted-wallet-market
ROOT255_PG_CLUSTER=/home/ubuntu/root239-cli-control-20261018/heavy-work/root239/tools/ae14-procurement-composition/test/pg-cluster.mjs \
  node --test server/scripts/test-root255-entitled-mount.mjs
```

`ROOT255_PG_CLUSTER` is the disposable verify-full cluster helper. It is not the wallet vendor and it is not a checkout path substituted for `vendor/hosted-wallet-market`.

## Counts, kept separate

ROOT253 first gate, receipt `/home/ubuntu/root253-cli-independent-20261018/`: 19 tests, 17 pass, 2 fail, `duration_ms` 29413.896329, EXIT 1, ENDED 2026-10-18T01:59:16Z. The two failures are `guard-recovery.test.mjs` and `native-debt.test.mjs` because `ROOT71_SDS_WORKTREE` was absent. They are not adjudicated product failures.

ROOT253 preserve rerun: 2 files, 24 pass, 0 fail, `duration_ms` 9113.348999, EXIT 0, ENDED 2026-10-18T02:05:44.047378+00:00, compiled owner `2b8a9993f98bfe9c943d7ead90d29a84e1ed25cb`.

ROOT254 `unit.log`: 9 pass, 0 fail, `duration_ms` 802.041042, EXIT 0, with the input closure above. The earlier bare unit run was 8 pass and 3 fail on missing sibling files. Those 3 fails are not part of the 9.

This writer, after the source change:

- `retained-outcome.test.mjs`: 1 pass, 0 fail, `duration_ms` 3433.102704.
- `preserve.test.mjs`: 10 pass, 0 fail, `duration_ms` 21823.041687. The blackhole subtest `duration_ms` 20015.929224 still returns `chain_unreachable` inside the 20000ms reader deadline.
- `packed-client.test.mjs`: 1 pass, 0 fail, `duration_ms` 313.094203.
- `source-lineage.test.mjs`: 2 pass, 0 fail.
- `guard-recovery.test.mjs`: 1 pass, 0 fail, `duration_ms` 1982.607253.
- `native-debt.test.mjs`: 1 pass, 0 fail, 22 subtests pass, `duration_ms` 5552.774741.
- One combined invocation of guard, native-debt, and source-lineage: 26 pass, 0 fail, `duration_ms` 5644.138595. That 26 counts the 22 native-debt subtests. It is not a sum with ROOT253 or ROOT254.

SDS candidate `server/scripts/test-root255-entitled-mount.mjs`, one invocation after the vendor pin reseal: 2 pass, 0 fail, `duration_ms` 2388.500246. Per file inside that invocation: cold import `duration_ms` 48.93133; mounted entitled read `duration_ms` 2255.301882. Those 2 are not part of the Pilot counts above.

## Next Root read

Root alone installs credentials. Use the existing private profile and allow 60000ms. A 20000ms deadline is not proof the transfer failed. A prior authenticated review took 21703ms.

```sh
ae task retained \
  --task continuity-234100-v1:continuity \
  --reservation root-fund-continuity-234100 \
  --receipt-file <absolute-new-path> \
  --ca-file <controller-ca> \
  --timeout-ms 60000
```

Expected paid-once join: `status` `native_paid`, `fulfillmentPaid` true, `payoutState` `owed`. `status` `owed` with `fulfillmentPaid` false is still unpaid. This session did not run that command.
