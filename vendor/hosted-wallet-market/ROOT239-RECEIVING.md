# ROOT239 retained-outcome receiving

The maintained reservation-only review cannot return an accepted artifact. `GET /v1/review?reservationId=` with the existing session returns the review source and `fulfillment.paid` false. It does not return artifact bytes, terms binding, or a paid-once join. An equally equipped direct read of that same URL returns the same thin object. The bytes already live on the accepted submission. This change reads them through the existing route. It does not add a client, ledger, score, receipt authority, account, or payment.

## Route

`GET /api/neomorphic-contributor-journey/v1/review`

- Reservation id only: unchanged thin review. `fulfillment.paid` is false. No `entitled` object and no artifact body.
- `taskId` and `reservationId` together: the same GET adds `entitled` schema `pilot.root239.entitled-result.v1`. The caller must already be a party (quote requester, grant account, or an existing journey task/work link). The join requires the authenticated role, task, reservation, terms, exact artifact bytes and digest, verdict, and canonical disposition.
- `fulfillment.paid` is true only when the disposition projection is `native_paid`, `kernelPaid` and `nativePaidObservation` are true, `transferInitiated` is false, archival `payoutState` is `owed`, and both payable flags are false. Accepted-unpaid stays projection `owed`, `paid` false, and payable when the registry has no hold.
- `usefulOutcome` stays null unless the accepted aggregate supplies a bounded token. A refusal body is returned unchanged. A paid boolean, HTTP 200, or viewer string alone is refused by `ae task retained`.
- The response omits transaction hash, recipient, and source address. The read does not journal, pay, transfer, or submit.

Authorization reuses the existing session cookie. A wallet session is the hash of the full cookie pair. A contributor session is the hash of the cookie value. Wallet delivery still requires `cookie_hash` to equal the matched session hash. Expired or revoked sessions return 401 `revoked`. A missing cookie returns 401 `unauthenticated`. A non-party returns 404 `not_found`. A party with the wrong task returns 409 `mismatch`.

## Cold command

Install the packed archive offline. Its sha256 is `6c1186e6f0e5f4bfbbfa3887a0c0df728f51c6dff8605c9cfe0d6cf3e069b1e3`. `sourceCommit` and `baseClient` stay `480c8199629fa4b35bc05e878b640d3fb9442b50`. Composition is `client456+task.retained` (33 members). Packed `src/fee.mjs` remains `20df3025e4c79268880b8a1f70cce6109ec6cc0c45bc74b0455c9c003a752f6e`. Packed `src/canonical.mjs` remains `7a6f56131f1c445727d9cf828394ea19c2ea57f6640d0002f4ba6162cda63222`.

```sh
npm install --ignore-scripts --offline --prefix <empty-dir> client/agent-economy-client-0.1.0.tgz
```

`AE_HOME` is the existing private profile directory, mode `0700`, kind `live`, origin the enrolled controller. `secret.json` is the existing session, mode `0600`. Do not pass a password, cookie, or recovery code on the command line. The receipt path must be absolute and must not already exist.

```sh
ae task retained \
  --task <task-id> \
  --reservation <reservation-id> \
  --receipt-file <absolute-new-path> \
  --ca-file <controller-ca> \
  --timeout-ms 60000
```

Stdout is one JSON object, schema `ae.retained-outcome.v1`: status, role, ids, terms version, artifact byte count and digest, verdict outcome, business status, disposition projection, fulfillment state and paid flag, payout state, payable flags, hold reason, useful outcome, obligation id, proof joins, receipt byte count and digest, and elapsed time. The artifact body stays in the mode `0600` receipt. That receipt is the HTTP response. A second run with a new receipt path reads again and does not pay.

Exit `0` on a joined owed or native-paid result. Exit `1` for `mismatch`, `artifact_absent`, `artifact_digest_mismatch`, `terms_unbound`, `incomplete_evidence`, `stale_evidence`, `entitled_join_refused`, or `paid_bool_unjoined`. Exit `3` for `unauthenticated` or `revoked`. Exit `5` for `not_found`.

## Expected actual read

Root supplies the existing private profile on the enrolled controller. The original identifiers already recorded in ROOT191 are obligation `oobl_izUh7nn9vd_APjsR`, financial reservation `root-fund-continuity-234100`, and task `continuity-234100-v1:continuity`. This session did not open that profile, did not call the enrolled controller, and did not retrieve the accepted 3608-byte refusal. Fixture success is not that read.

Compare the receipt artifact bytes and `artifactDigestSha256` with the original accepted artifact. `status` `native_paid` with `fulfillmentPaid` true and `payoutState` `owed` is the paid-once join. `status` `owed` with `fulfillmentPaid` false remains genuinely unpaid. `usefulOutcome` null means the caller did not supply a bounded usefulness token. It is not a guess from the refusal text.

The payment notice on that work is Sent-verified. Sent-verified is not proof the recipient received the notice. This read does not send a notice.

A prior authenticated review took 21703ms. Pass `--timeout-ms 60000` on the real controller. A 20000ms client deadline is not evidence the transfer failed. The local fixture may still finish under the shorter deadline because its chain stub answers immediately.

Direct comparison, same cookie, no new command:

```text
GET /api/neomorphic-contributor-journey/v1/review?reservationId=<reservation-id>
GET /api/neomorphic-contributor-journey/v1/review?taskId=<task-id>&reservationId=<reservation-id>
```

The first stays thin. The second is the entitled join. Repeating either one must not change accounts, obligation `payout_state`, or disposition rows.

## Fixture evidence

Public tests use synthetic ids only. The paid fixture body is `SYNTHETIC-PAUSED-MAKE-REFUSAL-root239` with projection `native_paid`, business status `refused`, `usefulOutcome` null, and archival payout `owed`. The owed fixture body is `SYNTHETIC-ACCEPTED-UNPAID-root239` with projection `owed` and `paid` false. An opportunity fixture returns its exact bytes as owed. Wrong task, foreign party, absent reservation, missing cookie, expired session, digest mismatch, unbound terms, and null evidence return the enums above. A repeated read and the existing signup readback keep the same account id and the same row counts.

## Rollback

Revert the entitled-read commit to restore the thin review for a paired task and reservation. Delete a mode `0600` receipt if one was written. There is no payment, notification, or installation to undo.

The later upgrade commit adds append-only `hosted_wallet_market.source_succession`. Reverting that commit does not delete `consumer_enrollment`, `native_debt_dispositions`, or earned obligations. Dropping only `source_succession` removes the successor record. The enrolled source hash and the original paid observation stay. Do not delete enrollment or obligations, and do not re-enroll from a caller-supplied baseline. See `ROOT255-RECEIVING.md` for the owner transition and the input closure.

## Tests run here

- `node --test tools/agent-economy-client/test/retained-outcome.test.mjs` — 2 pass.
- `node --test tools/agent-economy-client/test/unit.test.mjs` — 8 pass, 3 fail. The failures are missing checkout files outside this writer: `tools/ops/funded-continuation/participant-wire.mjs`, `tools/ops/funded-continuation/journal-recovery.test.mjs`, and `overview/self-evaluations/2026-10-14-agent-economy/packages/C/CONTRACT-REQUESTS.md`. Route count 32 and `docs/HTTP.md` equality were asserted before the missing contract-requests read. Help includes `task.retained`.
- `node --test tools/root71-hosted-wallet-market/test/packed-client.test.mjs` — 1 pass.
- `node --test tools/root71-hosted-wallet-market/test/retained-outcome.test.mjs` — 1 pass, after correcting the value-hash account id length and spawning the CLI asynchronously so the in-process server can answer.
- `node --test tools/root71-hosted-wallet-market/test/source-lineage.test.mjs` — 2 pass.

Not run in that earlier pass: `test/staging.test.mjs` (it expects `/tmp/root71-pins/sds` and anvil), `test/native-debt.test.mjs`, and `test/opportunity-receiving.mts`. No controller install and no private original-result execution.

ROOT254 later ran the same client unit file with its input closure and recorded 9 pass, 0 fail. ROOT255 records the separate gate, rerun, and post-change counts in `ROOT255-RECEIVING.md`. Do not add those runs into one total.
