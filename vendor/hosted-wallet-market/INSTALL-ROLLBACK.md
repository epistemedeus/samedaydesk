# Private install and rollback, ROOT191

This is the successor to the ROOT186 recipe preserved at Pilot `5683f40c`. No live installation, migration, enrollment, signature, payment or publication was performed by this review. Original 234100 is already paid once. Never execute its sender again.

The SDS composition descends from installed `2b8a9993f98bfe9c943d7ead90d29a84e1ed25cb` through `52a93bfe`. Neo remains `0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556`; maintained client456 remains `480c8199629fa4b35bc05e878b640d3fb9442b50`. Use the final ROOT191 feature exports in the receiving receipt. Do not install the historical SDS310 artifact.

## Artifact and declared private runtime

Run these commands from the composed SDS artifact root. A Pilot checkout, `.git`, an old provider build path, and `--sds-pin` are unnecessary. Install the SDS lockfile's runtime dependencies with `npm ci --omit=dev --ignore-scripts`. The adapter, SQL, admin command, native canonical receiving port and source-lineage contract are under `vendor/hosted-wallet-market`. The existing compiled contributor runtime supplies accepted-work, immutable-terms and requester-verdict validation. The unchanged `pg` dependency is declared by the artifact. The packed client is client456 `480c8199629fa4b35bc05e878b640d3fb9442b50` plus the read-only `ae task retained` command, at `vendor/hosted-wallet-market/client/agent-economy-client-0.1.0.tgz` (sha256 `6c1186e6f0e5f4bfbbfa3887a0c0df728f51c6dff8605c9cfe0d6cf3e069b1e3`). Install that archive in an empty directory with `npm install --ignore-scripts --offline <archive>`. Its `ae task intent`, `ae task intent sign`, `wallet declare`, `account resume`, and `ae task retained` commands are present; the older Root53 archive is not this composition. Fee and canonical module hashes are unchanged. Public wallet capability still requires its existing genuine network admission; do not fabricate an admitted receipt or bypass its refusal.

Root supplies the existing verified database, owner bearer, private release snapshot and configured read-only Base RPC through the established private environment. The mount selects `CONTRIBUTOR_JOURNEY_DATABASE_URL` when present, otherwise `DATABASE_URL`; it does not overwrite either value. The explicit earned schema must name that same store. Keep the current full 71-value snapshot and retained account, replay, integrity and cursor keys. An environment-name inventory is not a credential value or qualification.

Set the 17 names exported by `src/profile.mjs` (`ADDITIVE_ENV_KEYS`), with:

- mode `private`, label `PRIVATE`, schema `hosted_wallet_market`, and the actual existing earned schema and private tenant;
- chain `eip155:8453`, settlement token `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`, and the existing server-bound fee-recipient address;
- payments `off`, public reads `0`, funded tasks `off`, human assets `off`;
- TLS `verified-edge`, exact existing HTTPS origin, and the Root-configured RPC;
- `HOSTED_WALLET_MARKET_DISCHARGE_REGISTRY` pointing to the restricted read-only delivery of Root's existing controller registry.

The registry contains the original `transfers/`, `discharges/` and any journaled `obligations/` records with the sender's hashed filenames. Directories are real mode0700 directories and files are mode0600 regular files. Root transfers only the complete relevant already-received allocation/discharge and pending-outcome records through its restricted file route. Do not put a wallet, private key, signer, intent containing credentials, customer artifact, or registry record in Git or a public artifact. This reader cannot create a claim, reservation, transfer allocation, receipt or directory. It verifies the receipt id, original obligation, separate financial reservation, source/destination, immutable work/terms and existing exclusive allocation. Copying caller flags into a file is not this Root-controlled route.

Leave `HOSTED_WALLET_MARKET_ENTRY` unset. Requests from the maintained client carry `x-ae-wire-version: c0-1`; other contributor session/review routes retain the existing consumer. Wallet routes require direct TLS or the existing contributor ingress guard. Human assets and public contributor reads remain off. The private market's anonymous discovery returns an empty catalog while its public-read flag is off.

## Root release and qualification

Use the reviewed ROOT191 Root runtime export, derived from release producer `ed74603231abbaecc7ba262ac7983b016858bb3c` and qualification core/CLI from PR455, commit `de1f75fe320cebf67e0836d1f43c11c915176198`. The supplied concatenation `455de1f75...` is not a Git commit. The original producer accepts machine-service additions only; its original qualification handoff refuses added names. Do not run those old versions for this wallet composition.

The declared Root runtime consists of the four `tools/ops/hostinger-{managed-release,release-environment,contributor-qualification,contributor-qualification-cli}.mjs` modules, `overview/remote-worker/reference/root141/install-qa-environment.mjs`, and the exact packaged `src/{release-profile,profile,chain}.mjs` at `tools/root71-hosted-wallet-market/src/`. Preserve those relative paths when staging outside Pilot. The CLI stages the same closure for its isolated activation child. Its unchanged network receiver input remains the accepted `fd46d85c` contract. None of these tools is a provider credential or successful qualification.

The manifest must bind the exact new SDS branch/commit, unchanged Neo commit and current full snapshot. Add:

```json
{"environmentPolicy":{"profile":"private-wallet-source","installPacket":"/private/root191-release/install.json","rollbackPacket":"/private/root191-release/rollback.json"}}
```

Prepare the packet from mode0600 files with the current full environment and only the 17 configured wallet additions. The output directory must not exist:

```sh
node vendor/hosted-wallet-market/bin/installed-debt.mjs prepare-release \
  --manifest /private/release-manifest.json --input /private/current-env.json \
  --wallet /private/wallet-env.json --output /private/root191-release
```

This writes mode0600 `install.json`, `rollback.json` and a planned-only receipt in a mode0700 directory. Retained authority and all unrelated values stay equal; only contributor mode/managed flags are temporarily disabled for rollout. The exact original environment is the rollback preimage. Wallet payments/public/funded-task/human flags stay off. Packet preparation never sends, qualifies or installs anything.

Follow the reviewed `tools/ops/hostinger-contributor-qualification.md` lifecycle with `--journey new-source`, the accepted predecessor journal with its exact source, and this manifest. Release phases are `prepare`, **`install`**, `start`, `read`, `restore-linkage`; `install-disabled` belongs to the legacy profile and is refused for this policy. Then run qualification prepare, invalidate/probe/restart/read/qualify and activation prepare/apply/restart/read/health exactly as documented. The complete wallet profile survives those phases; the original snapshot remains unchanged. Preserve main auto-deploy `false`, full linkage and existing machine services. Keep one operation identity and reconcile unknown POST/PUT outcomes without resending. Old source-bound qualification cannot be copied to a new SDS source. Root's final health receipt still proves preservation of the original unpaid debt before the separate paid-projection import.

## Database and installation

Bind `DATABASE_URL` for the admin process only to the selected native store, plus `HOSTED_WALLET_MARKET_EARNED_SCHEMA`. Do not replace the hosted application's unrelated global database configuration.

```sh
node vendor/hosted-wallet-market/bin/installed-debt.mjs migrate
node vendor/hosted-wallet-market/bin/installed-debt.mjs seal
node vendor/hosted-wallet-market/bin/installed-debt.mjs inspect
```

`migrate` applies only packaged additive006 in a transaction. It does not replay historical serving migrations or migration005, change original terms, or update owed obligations. Existing incompatible one-case/v2 debt tables return `native_schema_incompatible` before SQL application. Do not drop them to make this pass. Root first receives any existing durable rows and chooses a separate compatible migration if one is actually needed. ROOT186 claimed no live installation.

`seal` records the initial IDs from both owning ledgers without copying obligations. An existing seal must already be complete. New obligations subsequently enter the guard inventory atomically through their owning insert, preserving restart readiness without manual ID edits. Immutable triggers protect both earned-work and opportunity obligations and every disposition/enrollment. Existing reservations, quotes, proofs, acceptance and operation outcomes remain.

Main earned-work amounts are decimal USDC and are converted exactly to six-decimal atomic units. Opportunity rewards are already atomic. Neither source is repriced.

The actual original `oobl_izUh7nn9vd_APjsR` stays in `opportunity_obligations` with `paid=false`, `transfer=null`, `payout_state=owed`. Do not insert a similarly named row into `earned_work_obligations`. The normal installed adapter verifies the canonical terms, frozen submission and authenticated requester verdict in place. `base` with chain8453 is explicitly normalized to `eip155:8453`; other rails refuse. The financial reservation is distinct from the kernel claim id.

## Enroll, receive, and read back

The owner bearer is the existing installed `CONTRIBUTOR_JOURNEY_OWNER_TOKEN`; standalone use can fall back to an already configured `EARNED_WORK_OWNER_TOKEN`. A configured native owner takes precedence and a conflicting standalone token refuses. No new bearer is added by the 17-key packet. It is read from the private environment and sent only to the configured exact HTTPS origin, without redirect following. The server sends no bearer, session cookie or origin header to the RPC. Neither RPC nor registry paths come from JSON.

```sh
node vendor/hosted-wallet-market/bin/installed-debt.mjs enroll --operation root191-enroll-unique
node vendor/hosted-wallet-market/bin/installed-debt.mjs enrollment
node vendor/hosted-wallet-market/bin/installed-debt.mjs prepare \
  --input /private/original-discharge.json \
  --received-at 2026-10-17T14:49:36.737Z \
  --output /private/root191-original-import.json
node vendor/hosted-wallet-market/bin/installed-debt.mjs import \
  --input /private/root191-original-import.json --operation root191-original-unique
node vendor/hosted-wallet-market/bin/installed-debt.mjs disposition \
  --obligation oobl_izUh7nn9vd_APjsR
```

`prepare` exclusively creates a mode0600 body file, using the original full sender discharge, configured tenant and stable receiving time. It cannot authorize an import. The server independently requires the corresponding Root registry records, accepted store source, enrolled source/host/profile/store/RPC binding and successful canonical finalized transfer. The stored RPC origin and full endpoint hashes both bind the profile without exposing credentials. Chain id, transaction, receipt, log index, removed state, exact token/source/recipient/value, canonical block/hash/time and finalized height must agree. Hostile, oversized, redirected and mismatched JSON-RPC responses refuse.

The original evidence is Base block52729611/log102, transaction `0xc90108e141b78d6581b4bc39dc810723570d492fd0fdd57622137aa2a6efc2de`, receipt `83b4331a83480cce74a2d5142b66149c986f913621cc121a859e25c6bef3ac4e`, net100000atomic, reservation `root-fund-continuity-234100`. No 5% fee is applied retroactively. A differently valued legitimate obligation uses the same entry with its own existing Root allocation and accepted source.

Expected readback is `native_paid`, `kernelPaid=true`, `kernelTransfer` equal to that known hash, `transferInitiated=false`, `payable=false`, `newPayable=false`, archival `payoutState=owed`. Existing authenticated native review uses the existing canonical qualification interface and reports verified paid. Before import, an obligation with a Root discharge or journaled unknown payment returns an explicit hold with `payable=false` and `newPayable=false`; loss of a projection never authorizes repayment. Other obligations stay owed. Bare canonical `currentImportContract()` intentionally remains unbound; a descriptor or supplied `client`, `baseline`, `installed`, `verified`, `paid`, or RPC value cannot bind it.

A lost response is readback/replay of the same operation and exact prepared body, never another transfer. Changed bodies refuse. Concurrent receives retain one projection. Missing/stale/conflicting enrollment is a hold. A consumed proof stays consumed even if the process or registry becomes unavailable.

## Rollback and reinstall

1. Unset the adapter mode or stop its process, then restore the previous SDS code through the accepted release controller and restore the captured environment/linkage. Remove only keys added for this adapter. Leave native contributor configuration, all original71 values, keys, credentials, database and retained files intact.
2. Keep both schemas, the guard, obligations, reservations, accepted work, quotes, proofs, funding intents, operation outcomes, enrollment, dispositions and original Root registry. **Production rollback contains no DROP SCHEMA, DELETE, TRUNCATE, reallocation or second payment.**
3. Run `node vendor/hosted-wallet-market/bin/installed-debt.mjs rollback-check` before disabling the new artifact. The check reads durable state; it does not remove it. The old process can leave the projection unavailable. That is a hold, not permission to repay.
4. Reinstall the exact same reviewed profile, source and store and read the existing projection. An identical receive remains idempotent and another obligation cannot consume the proof. A changed enrollment requires Root receiving; do not delete its row to re-enroll.

A new packaged file changes `installedSourceSha256()` even when `consumerContractSha256()` is unchanged. The enrolled row stays. Root, and only Root, repeats empty-body `POST /v1/native-debt/enroll` after the artifact pin matches the new bytes. That appends `hosted_wallet_market.source_succession` for the old source hash, the new source hash, the new host pin hash, the same consumer contract, and the live disposition seal. A caller-supplied baseline is `body_refused`. A host-only or rail change is `enrollment_conflict`. Dropping `source_succession` removes that successor record only. It does not delete enrollment, dispositions, or obligations. The payment notice remains Sent-verified. Sent-verified is not proof the recipient received it, and this upgrade sends no notice.

Disposable fixture teardown is separate and is never a production rollback command.
