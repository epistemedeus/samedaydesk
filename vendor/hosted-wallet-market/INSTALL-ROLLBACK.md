# Install and rollback

This recipe is executable once the prerequisites below are supplied. This session does not supply them and does not run the recipe against a live database.

Public chains, payments, funded-task activation, and human-asset changes stay off. Neo migration `005_obligation_settlement_and_retention.sql` is not part of this recipe. ROOT53-A client qualification and ROOT53-C reader packaging are not part of this install.

## Prerequisites

1. Verified TLS. Standalone serve: certificate and key files for the listen host (`HOSTED_WALLET_MARKET_TLS=files`). SDS mount: an HTTPS edge whose origin is exactly `HOSTED_WALLET_MARKET_ORIGIN` (`HOSTED_WALLET_MARKET_TLS=verified-edge`). The origin is `https`, has no userinfo, and is the origin clients send.
2. A private Postgres URL with `sslmode=verify-full`. Allowed query keys are `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, and `application_name`. The earned-work and account tables are already present. Do not re-apply the serving migrations on that database.
3. `HOSTED_WALLET_MARKET_EARNED_SCHEMA` set to that existing schema name. It must match `^[a-z][a-z0-9_]{0,62}$` and must not be `public` or `pg_*`. If it is not `cj227_earned_work`, replace only that identifier in `schema/006_hosted_wallet_market.sql` before applying. The package helper `applyAdditiveSchema` does that replacement.
4. `HOSTED_WALLET_MARKET_TENANT`, a private tenant id matching `^[a-z][a-z0-9_-]{2,63}$`. The additive installation row stores this tenant with the earned schema and chain. A second boot with a different tenant, schema, or chain is refused.
5. `HOSTED_WALLET_MARKET_CHAIN` and an RPC URL (`--rpc` or `HOSTED_WALLET_MARKET_RPC`). A private `eip155:<id>` is the funding chain. `eip155:1` is refused. `eip155:8453` and `eip155:84532` are accepted only while payments, funded tasks, human assets, and public reads stay off. That profile reads the chain at startup and refuses funding, funding intents, and `authorized_capture`. It does not sign, transfer, or pay.
6. These values, all required: `HOSTED_WALLET_MARKET_MODE=private`, `HOSTED_WALLET_MARKET_LABEL` (a deployment label such as `PRIVATE`), `HOSTED_WALLET_MARKET_SCHEMA=hosted_wallet_market`, `HOSTED_WALLET_MARKET_PAYMENTS=off`, `HOSTED_WALLET_MARKET_PUBLIC_READS=0`, `HOSTED_WALLET_MARKET_FUNDED_TASKS=off`, `HOSTED_WALLET_MARKET_HUMAN_ASSETS=off`. `HOSTED_WALLET_MARKET_FEE_RECIPIENT` and `HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN` are lowercase `0x` plus 40 hex characters. They are addresses, not secrets. The fee recipient is the server-bound destination of the quoted USDC gross. The settlement token is the contract on `HOSTED_WALLET_MARKET_CHAIN` whose `Transfer` log is the funding proof. The SDS mount does not forward these two fields. The adapter reads them from the process environment when the mount omits them. A task body `feeRecipient` must equal the server recipient, or the post answers `fee_recipient_refused`.
7. A checkout of SDS `e56c4d84f1c59f02307d5aa9a2c330957a28aa6d` passed as `--sds-pin`, so admission refuses any `HOSTED_WALLET_MARKET_*` name that the installed config modules already use.
8. For the SDS process, leave `HOSTED_WALLET_MARKET_ENTRY` unset. The composed artifact resolves `vendor/hosted-wallet-market/src/server.mjs` from its own root. A relative override must stay inside that installation. An absolute path, including a Pilot checkout or an old provider build directory, is refused. Unset `HOSTED_WALLET_MARKET_MODE` leaves the journey mount unchanged. A set but invalid profile refuses startup. The adapter declares `pg` `8.23.0`. The SDS package already depends on `pg`. Cold receiving does not install a second copy and does not need this Pilot tree.

## Install

1. Apply the additive file once on a database that does not have it. It creates schema `hosted_wallet_market`, schema `hosted_wallet_market_guard`, the additive tables, `hosted_wallet_market.funding_intents`, the installation row's table, unique index `quotes_funding_evidence_key` on non-null `quotes.proof_id`, and trigger `earned_work_obligations_preserve_legacy`. The installation chain check refuses `eip155:1` only. The captures chain check still refuses `eip155:1`, `eip155:8453`, and `eip155:84532`. It does not copy environment values. The server does not write the guard seal. A database that already applied the amendment-4 file does not get the new table or the relaxed installation check from `CREATE TABLE IF NOT EXISTS`. Run the two statements below once on that database. Do not relax the captures check. This package does not apply either statement to a live database.

```sql
CREATE TABLE IF NOT EXISTS hosted_wallet_market.funding_intents (
  task_id TEXT PRIMARY KEY REFERENCES hosted_wallet_market.quotes(task_id),
  account_id TEXT NOT NULL REFERENCES cj227_earned_work.journey_accounts(id),
  tenant TEXT NOT NULL,
  payer TEXT NOT NULL CHECK (payer ~ '^0x[a-f0-9]{40}$'),
  not_before_block BIGINT NOT NULL CHECK (not_before_block >= 0),
  message TEXT NOT NULL,
  authorized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE hosted_wallet_market.installation DROP CONSTRAINT installation_chain_check;
ALTER TABLE hosted_wallet_market.installation
  ADD CONSTRAINT installation_chain_check
  CHECK (chain ~ '^eip155:[0-9]+$' AND chain <> 'eip155:1');
```

Replace `cj227_earned_work` with `HOSTED_WALLET_MARKET_EARNED_SCHEMA` when that name is different. The expected name of the existing column check is `installation_chain_check`.

A database that already applied an older copy of this file does not grow new tables until the missing statements are applied. `CREATE TABLE IF NOT EXISTS` does not alter a table that already exists and does not replace its checks. This session did not apply SQL to a live database. Do not relax the captures check or the obligation trigger. Replace `cj227_earned_work` when the earned schema name differs.

If `hosted_wallet_market.native_debt_dispositions` and `hosted_wallet_market.consumer_enrollment` are absent, apply the current `schema/006_hosted_wallet_market.sql` on a database that has not applied this file, or apply only those two tables, their functions, and their triggers from that file. Those statements do not pin one transaction, one obligation, one amount, or one receipt. The rail checks remain Base `eip155:8453` and USDC `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`. `kernel_paid` is the bound projection. `transfer_initiated` stays false. `payout_state` stays `owed` because the archival obligation row is not rewritten. Enrollment `profile_chain` is `eip155:8453`.

If that disposition table already exists from the earlier one-case file, stop. Do not `DROP` it in this recipe. `CREATE TABLE IF NOT EXISTS` will not widen it. A table that holds an allocation is durable money state. An empty one-case table is still not dropped here. Replacing it is a separate reviewed change, and only when a read shows it holds no row.

Do not apply the retired checks that required transaction `0xc90108e141b78d6581b4bc39dc810723570d492fd0fdd57622137aa2a6efc2de`, log `102`, block `52729611`, amount `100000`, receipt `83b4331a83480cce74a2d5142b66149c986f913621cc121a859e25c6bef3ac4e`, obligation `oobl_izUh7nn9vd_APjsR`, `kernel_paid = FALSE`, or `import_state = 'unbound_fail_closed'`. That receipt stays receiving evidence. It is not an acceptance whitelist.

Applying the current file once on a database that does not have it creates the tables. Do not re-apply the whole file on a live database only to add a table.
2. Before the first hosted capture, copy every existing obligation id into the guard, then seal that copy. Substitute the earned schema name. An empty copy still needs the seal row, or `check` and startup refuse with `guard_unsealed`. A seal that omits any obligation id is `guard_incomplete`. Capture is refused until both are true. The server appends each new hosted-capture obligation id in the same transaction as the obligation insert. The server does not write the seal.

```sql
INSERT INTO hosted_wallet_market_guard.preserved_obligation_ids (id)
SELECT id
FROM cj227_earned_work.earned_work_obligations
ON CONFLICT DO NOTHING;

INSERT INTO hosted_wallet_market_guard.obligation_guard_seal (id, sealed_at)
VALUES (TRUE, now());
```

3. Set the environment keys in the prerequisite list. Do not set payments on, public reads above 0, funded tasks on, or human assets on. Do not write those values into a new table. The database URL stays a flag or the existing `DATABASE_URL`. The replay key below is an existing journey key, not a new `HOSTED_WALLET_MARKET_*` name.
4. Admit the names and read the shape:

```sh
hosted-wallet-market check --database-url "$DATABASE_URL" --sds-pin /path/to/sds
```

`configValuesCopied` must be false. `legacyTrigger`, `guardSealed`, and `guardComplete` must be true. `check` does not require the replay key and does not decrypt anything.
5. Start one of these two shapes.
   - Standalone, certificate files:

```sh
hosted-wallet-market serve \
  --database-url "$DATABASE_URL" \
  --rpc "$HOSTED_WALLET_MARKET_RPC" \
  --port 443 \
  --cert /path/to/cert \
  --key /path/to/key \
  --sds-pin /path/to/sds
```

   - SDS mount: export the prerequisite keys, including `HOSTED_WALLET_MARKET_TLS=verified-edge` and `HOSTED_WALLET_MARKET_ORIGIN`. Leave `HOSTED_WALLET_MARKET_ENTRY` unset so the process imports `vendor/hosted-wallet-market/src/server.mjs` from the artifact root. Start the SDS process. The adapter is registered before `mountContributorManagedDesk`. Routes it does not own fall through. The aged-review contributor and opportunity mounts stay. Restarting the process on the same origin and the same database replays a committed operation id from `earned_work_idempotency` instead of inserting a second observation. A lost response after commit is recovered by `ae operation recover` against that same origin. A funding proof that is already stored still answers `funding_proof_reused` after that restart.

6. Do not `ALTER` earned-work columns, terms, or existing debt. Do not apply migration 005 as part of this recipe. Do not activate a public chain or a payment rail.
7. `hosted-wallet-market serve` reads `CONTRIBUTOR_JOURNEY_REPLAY_KEY` from the process environment. That name is already required by the installed journey when `CONTRIBUTOR_JOURNEY_INSTALLED=1`: 64 hex characters, distinct from the other two installed journey keys. This package does not add a secret table and does not print the key. The SDS mount reads the same variable inside the adapter. In-process tests may pass it as `replayKey` instead of putting it on `process.env`.
8. Capture authority is the existing earned-work owner bearer, `EARNED_WORK_OWNER_TOKEN`, presented as `Authorization: Bearer` on `POST /v1/review/authority`. Signup cannot create an authority role. Do not insert one. The token is not a new `HOSTED_WALLET_MARKET_*` name and is not stored by this package. `--sds-pin` is the checkout that contains `assertOwner`. A missing or wrong bearer answers `403 authority_required`. `verified_deposit` is accepted only for a USDC task on a private chain when the receipt is successful and contains a `Transfer` log from `HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN`. The log sender and the transaction sender are the requester's bound wallet. The log recipient is `HOSTED_WALLET_MARKET_FEE_RECIPIENT`. The log value is the quoted gross. The receipt block is strictly after the funding intent's `notBeforeBlock`. Native transaction value does not fund a USDC task. A missing wallet, or a sender that is not that wallet, answers `409 payer_unbound`. There is no third-party payer. A payer equal to the server recipient answers `409 self_pay_refused` even when the log matches. The proof id is the transaction hash. The unique index allows that hash on one quote. Another task answers `409 funding_proof_reused`. A public-read profile answers `409 funding_refused` for funding and `409 public_chain_effect_refused` for `authorized_capture`. Bind the requester wallet, then have that address sign the server-issued funding intent, before the transfer.

The packed client does not grow a funding-intent command. After `ae task post` and the wallet bind, call `POST /api/neomorphic-contributor-journey/v1/tasks/<taskId>/funding-intent` with `{}`, sign the returned message with EIP-191 `personal_sign` from the bound address, then `POST /api/neomorphic-contributor-journey/v1/tasks/<taskId>/funding-intent/signature` with `{signature}`. Send the USDC transfer in a later block. `ae task fund` is unchanged. An address with contract code is `409 contract_wallet_unsupported`. ERC-1271 signatures are not accepted.

## Native debt receiving

This is the integration Root uses after this source is installed. It records one verified external discharge. It does not send a second transfer and it does not rewrite the archival obligation. The production entry is `importNativeDischarge` in the packaged `src/native-obligation-discharge.mjs`. Pilot `84a6c5bdd459f4a670951b722020b2b57fe1ae81` remains the contract source. Its `IMPORT_CONTRACT` object is unchanged. Import contract v2 digest `414ba86df5bfacd2876f38bd62d11781e9c9971cd8219ceec577f85dc0f93063`. `currentImportContract()` still returns `boundConsumer` null and `p2InstalledByThisPackage` false. Its contract object still has `p2DebtBaseline` `not_installed`. A call with `installed: true`, a supplied `baseline`, `store`, or `rpcUrl`, or `binding.installed` / `binding.assumedAlreadyHonored` / `binding.p2AlreadyHonors`, throws `discharge_consumer_unbound` before any write. The nonproduction registry seam still refuses a self-asserted installation. There is no execute route and no `--execute` or `--receive` path.

The installed consumer is version 2 of `pilot.root71.native-debt.consumer.v1`, exported as `NATIVE_DEBT_CONSUMER`. Its canonical sha256 is computed by `consumerContractSha256()` and is not a field inside the object. The digest changes when that object changes. Do not treat a previous digest as the installed one. It binds the import contract above. The store is `hosted_wallet_market.native_debt_dispositions`. Enrollment is `hosted_wallet_market.consumer_enrollment`. A bound projection reports `kernelPaid` true, `kernelTransfer` equal to the verified transaction, `nativePaidObservation` true, `transferInitiated` false, and `payoutState` `owed`. An absent row stays `kernelPaid` false and `importState` `unbound`. Supplied booleans are not authority.

Trust boundary. The process profile `HOSTED_WALLET_MARKET_RPC` is the only chain reader. Its origin hash is stored. The URL is not stored and is not taken from the request. `readRailTransfer` checks the enrolled read-only RPC for chain `eip155:8453`, receipt status success, the Transfer log at `log.logIndex`, token `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`, and the block timestamp. The recipient must equal the stored obligation `payout_destination`. The amount must equal the stored `reward_amount`. Asset `USDC`, network, tenant, task, terms, and reservation must equal the stored obligation and the installation. The receipt id is the caller's stable correlation id for that allocation. It is not chain authority. A different receipt id on the same allocation is `disposition_hold`. `receivedAt` must be canonical ISO, at or after the block timestamp, and not more than five seconds ahead of the process clock. It is not a chain field. The obligation row is not updated. No transaction is signed or broadcast. `eth_send*`, `eth_sign*`, and `personal_sign` stay refused. A second rail is not enabled. Base and USDC are the configured rail, not a one-transaction whitelist.

Enrollment is `POST /api/neomorphic-contributor-journey/v1/native-debt/enroll` with body `{}`, the existing owner bearer, and an idempotency key. The server writes source, import-contract, and consumer digests, the installation tenant, the rail, and the RPC origin hash. An identical enroll is idempotent. A different existing row is `409 enrollment_conflict`. A missing row is `409 discharge_consumer_unbound` on import. A source, digest, or origin that does not match the running process is `409 binding_stale`. Enrollment and dispositions are immutable. `GET /v1/native-debt/enrollment` reads the row back. The body does not contain the RPC URL.

The original obligation row must already exist and stay `payout_state` `owed`. This package does not insert that production row and does not invent its terms hash. The import body carries `termsVersion`, and the server requires it to equal the stored `terms_version`. The amount is that stored `reward_amount`. The 5% market fee is not applied to the original `100000` atomic obligation. A second stored obligation with a different amount and a separately verified transfer is accepted by the same code. A second obligation or reservation that presents an allocated transfer or log is `409 transfer_already_allocated` or `409 reservation_already_allocated`.

The kept receipt, for evidence, is transaction `0xc90108e141b78d6581b4bc39dc810723570d492fd0fdd57622137aa2a6efc2de`, log `102`, block `52729611`, amount `100000`, receipt `83b4331a83480cce74a2d5142b66149c986f913621cc121a859e25c6bef3ac4e`, received `2026-10-17T14:49:36.737Z`, obligation `oobl_izUh7nn9vd_APjsR`, reservation `root-fund-continuity-234100`, task `continuity-234100-v1:continuity`. Root receives that exact discharge after enrollment. This recipe does not broadcast it again.

If the guard is already sealed, that obligation id must already be listed in `hosted_wallet_market_guard.preserved_obligation_ids` before the process starts. The server does not add it during import.

Call `POST /api/neomorphic-contributor-journey/v1/native-debt/import` with `Authorization: Bearer` set to the existing `EARNED_WORK_OWNER_TOKEN` and an `Idempotency-Key`. The body keys are `importContractSha256`, `tenant`, `obligationId`, `reservationId`, `taskId`, `termsVersion`, `network`, `token`, `transactionHash`, `logIndex`, `blockNumber`, `amountAtomic`, `receiptId`, and `receivedAt`. `tenant` must match the enrollment and the installation. `kernelPaid`, `paid`, `transfer`, `installed`, `baseline`, and `rpcUrl` are `400 body_refused`. A repeated identical body returns the same bound view. A lost response after commit is recovered by repeating that key. `GET /v1/native-debt?obligationId=` reads the projection. A bound row is `state` `bound`, `projection` `native_paid`, `payable` false, and `newPayable` false. It is not a new payable obligation. An owed row with no disposition is `state` `absent`, `payable` true, and stays owed. Other owed rows, including original `221400` and the staging stand-in `obl_legacy23410001`, stay owed. Payout listing excludes an obligation that has a `kernel_paid` disposition.

## Read-only Base

A live-read profile is not a funding deployment. Set `HOSTED_WALLET_MARKET_CHAIN` to `eip155:8453` or `eip155:84532`, point `HOSTED_WALLET_MARKET_RPC` at a public Base HTTP endpoint, and keep payments, funded tasks, human assets, and public reads off. Health then reports `paymentsActivation` false, `publicChain` true, `remoteRead` `eth_call`, and `remoteDecimals` `6`. It does not report the RPC URL. Do not send a transaction through this process. The server refuses `eth_sendTransaction`, `eth_sendRawTransaction`, `eth_sign`, `eth_signTransaction`, and `personal_sign`.

## Profile control and locators

Release control stays Root's existing private release path. Pilot `ed74603231abbaecc7ba262ac7983b016858bb3c` names `tools/ops/hostinger-managed-release.mjs` and marks that plan history. It was not executed and it was not copied onto this branch. Qualification id `455de1f75fe320cebf67e0836d1f43c11c915176198` was not found and is not invented here. `id/ae38-service-release/source/pilot/tools/ops` was not on disk and was not executed. Do not use the other top-level `tools/ops` helpers. They ignore `environmentPolicy`. The shim `tools/ops/lib/native-obligation-discharge.mjs` only re-exports the packaged consumer. It is not a release controller. The enrollment row is the installation contract the consumer actually reads.

`fbd70f8e66e0c3d6695a4368f2f439c39f32407152d9b6650c519e8d321c6a33` is `keyNamesSha256`, not a debt digest. The historical private authority is `preserve-private-machine-services/e56c4d84` (71 values, preserving 59). That commit is historical input, not the installed SDS source. Root fresh-reads hosted state at install. `ADDITIVE_ENV_KEYS` stays 16 names. `HOSTED_WALLET_MARKET_ENTRY` and `EARNED_WORK_OWNER_TOKEN` are not in that list.

Secure locators, names only. Values are not written here:

- `DATABASE_URL`
- `CONTRIBUTOR_JOURNEY_REPLAY_KEY`
- `EARNED_WORK_OWNER_TOKEN`
- `HOSTED_WALLET_MARKET_RPC`
- `HOSTED_WALLET_MARKET_FEE_RECIPIENT`
- `HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN`
- `HOSTED_WALLET_MARKET_ORIGIN` for `verified-edge`, or the certificate and key file paths for `tls=files`
- `HOSTED_WALLET_MARKET_ENTRY`, optional. Leave it unset on the composed artifact. Do not point it at a Pilot checkout.
- `--sds-pin`, the checkout of `preserve-private-machine-services/e56c4d84`

## Lost response and expiry

Signup returns the session cookie and the one-time recovery code in that HTTP response only. The idempotency row stores AES-256-GCM ciphertext of those two values (`sealed.alg`, `iv`, `tag`, `ct`, `expiresAt`) under `earned_work_idempotency.response_json`, encrypted with `CONTRIBUTOR_JOURNEY_REPLAY_KEY`. `hosted_wallet_market.session_delivery` stores `sha256` of the cookie and the CSRF token in plaintext. CSRF is not a session cookie and is not a recovery code. Account rows store password and recovery hashes only. No row stores the cookie or the recovery code in plaintext.

The ciphertext expires 15 minutes after signup (`expiresAt`). Inside that window, the same signup idempotency key, or `POST /v1/account/readback`, decrypts and returns the original cookie and recovery code. It does not mint a second account. After `expiresAt`, a replay or readback answers `409 recovery_expired` and deletes every expired `sealed` field in that scope, not only the row that was presented. A later dump cannot be decrypted, because the ciphertext is gone. A row that nobody reads after expiry still holds ciphertext until that sweep runs; the key is not in the database, and `openSecrets` refuses it on timestamp alone. The account remains. A client that already holds the cookie keeps that session until the session's own 24 hour expiry. The one-time recovery code cannot be shown again. Reissuing it, or recovering an account whose cookie was never received and whose window has expired, is a Root operator path and is not implemented here.

Restart and lost-response recovery for any other committed operation use the same origin and the same database. `ae operation recover` readbacks the stored operation result and does not submit it again. The in-process response drop used by the staging harness is label `STAGING` only. The private SDS path does not expose that hook.

## Rollback

Production rollback disables the adapter and restores the previous process code. It keeps durable obligations, transfer allocations, reservations, accepted submissions, quotes, proofs, funding intents, enrollment, and dispositions.

1. Stop the adapter process, or unset `HOSTED_WALLET_MARKET_MODE` so the mount registers nothing. The contributor journey and the aged-review mounts stay.
2. Remove only the `HOSTED_WALLET_MARKET_*` keys you added for this process, including `HOSTED_WALLET_MARKET_RPC` when it was added for this adapter. Leave existing configuration names and `DATABASE_URL` untouched.
3. Restore the previous SDS artifact if this composition is being taken out of service. Do not `DROP SCHEMA hosted_wallet_market`. The helper `rollbackAdapter` checks that proofs, quotes, funding intents, dispositions, enrollment, installation, and the guard tables are still present, and that earned-obligation, account, and task counts did not change. It returns `adapterSchemaDropped` false and `durableRetained` true. A missing durable table is `rollback_refused`.
4. Reinstalling the same database must not make one stored proof or one allocated transfer available to a second task. The unique proof index and `native_debt_transfer_allocation` stay. A restart on that database returns the bound projection and still refuses a second claim.
5. Do not `DELETE` from `earned_work_*` or `journey_*`. Do not update or delete a disposition or an enrollment row. The obligation trigger still refuses both. `DATABASE_URL` and `CONTRIBUTOR_JOURNEY_REPLAY_KEY` are not adapter keys and are not removed by step 2.
6. Do not apply or revert migration 005 as part of this rollback. If 005 was applied by a separate decision, this rollback does not remove `capture_evidence` and does not rewrite owed rows.

`disposeAdapterSchema(client, {disposable: true})` drops schema `hosted_wallet_market` only for an explicitly disposable test database. It is not this rollback. It still does not drop `hosted_wallet_market_guard` or `earned_work_obligations_preserve_legacy`. Do not point it at a database that holds accepted work.

## What the disposable tests prove

The staging test keeps label `STAGING`, chain `eip155:31337`, and a loopback disposable database. Its guard is not the product rule.

The deployment test mounts label `PRIVATE` on another disposable loopback database and applies migration 005 only after `confirm=disposable-database-only`, host `127.0.0.1`, and a database name matching `ae14_b_j1_<hex>`. The profile validator accepts a non-loopback `sslmode=verify-full` URL and a non-31337 private chain id without connecting to them. A separate disposable test mounts `eip155:8453` against a public Base endpoint with payments off, reads chain id, head, and token decimals, and refuses funding, capture, and payout transfer. That mount is not this install. The legacy stand-in obligation in those tests is not live debt.
