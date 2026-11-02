# H115010 result

New native session `93e6553d-1c53-41ce-a157-95804c65f6e3` on host `bc-a067a2df-b1d9-488a-91ba-1468e2784e9c`. Model `grok-4.7`, effort `xhigh`. This is a new context in the same financial family. Session `931f286b-838b-4a0c-8530-32507123d049` and its RUN/SPEC stayed read-only. Checkpoint `2026-11-02T17:45:00Z` and requiredUntil `2026-11-02T18:00:00Z` stayed frozen. One aggregate of 2097152 KiB. Tests were serial with `--test-concurrency=1` and `--max-old-space-size=768`. No model children.

## Heads

SDS `codex/h103010-mixed-capability-composition-20261101` tested money `58b21010c69f9e5713e39fb2ee0b267eb9118d8c`, parent `263a7d4372366bcdfad1c3354489f7d13acea159`. This document commit is a later docs/export commit. It leaves the pinned money, rail, runtime, and host bytes unchanged.

Pilot companion `codex/h103010-operator-integration-20261102` tested grant source `015b83916d9e7d8d52c8681c276bf29e855e9efb`, parent `b4dbee3e2e2093707b88e03433735bf2aed0bb35`. The operator receipt commit is `f16091ccde8b685fc394dec9e27a08b996b853cb`. The funded fixture pinned `015b83916d9e7d8d52c8681c276bf29e855e9efb`.

`installedSourceSha256` `8c35b8f13a5cb6ac9399c630ccc2fdace428cd839949d62375127f924f322ad6`. `hostSourceSha256` `a5277b33df3ddf6e780aea3c360d2651312c546d860508d8d96fa463cadf04f3`.

Pin bytes at the tested money source:

- `vendor/hosted-wallet-market/src/machine-money.mjs` `059ac16fc3f4a8855bfa4e9d0c5c14840586d648247f66f5c6b0b5997396e54d`
- `runtime/agent-economy-rail/dist/local-chain.js` `c124c1e5d4d22e4b8d91e628187a18180a25fa98c43ca7907f63d1ed07193d61`
- `runtime/agent-economy-rail/dist/rail.js` `ebb3e191cb08ca7bba29087729d792786b7e616a50fb7f39b061062ff0f56870`
- `contracts/machine-runtime.json` `6479d4902b7df099da0697cd74dcff7a1b58472353bf6aa01c6e45b21179ae87`

Received pre-amendment fingerprint of those three source files, name-prefixed, was `6d210a7faf46016adc02dca4bfe4400dbb72b56bd42bceebcef7d2ff918850ac`.

## Outcome

One verifier, `pilot.retained-intent.v1`, lives in `machine-money.mjs`. The signing frame writes that record in the same RailStore transition as the raw bytes. Recovery and machine broadcast both call it. There is no second ledger and no production commit allowlist. `aa861e980df0f75a782ff30996450cf15870f2e7` and `290414e614f781357d41565258f4666208f5d70b` stay fixture inputs.

The record binds the raw hash, recovered operator, signed chain id, EIP-1559 type, reserved nonce, zero native value, gas and both fee caps, escrow destination, and authorize calldata. Fund recovery also binds the original operation, quote, approval, and payer signature. Expected calldata is encoded from the retained payment and payer signature. A legacy row has no journal record. Its proof is `historicalRetainedIntents` on the grant, taken from the original signing observation. Recovery preserves unknown, debt, holds, nonce, allocations, funding, and payment when that proof is missing or disagrees with the journal. Current generation uses the journal record and leaves a grant manifest unused when the journal record is absent. Historical generation uses received lineage plus the journal record, the grant manifest, or both when they digest-match. Changed current source, host, or epoch stays closed unless received lineage carries that closure. Neither generation calls the signer again.

`RailStore.frame` claims one send. A second caller on the same file sees attempting, unknown, or observed and does not send. A late unknown leaves observed in place. Receipt discovery promotes an old unknown to observed before return. Wallet broadcast, with no `authorizeIntent`, still sends the unjournaled raw bytes.

## Pre-amendment comparison

Preserved at head `263a7d4372366bcdfad1c3354489f7d13acea159` in `export/h115010/pre-amendment-countercases.log`, exit 0. The same-operator raw with an altered chain, nonce, value, gas, max fee, or priority fee each sent once and rewrote `authorizationTx`. Current raw paired with an old witness sent once. The short proofId-plus-calldata binding with a changed operation and a matching caller sent once (`authorizationAfter` `0xe232b9a16648f0bd15a2aa2a39feb0323660f78d2353881d0613959d6d16779b`). Payer-signature substitution sent once. The extended binding already returned `historical_unknown` for a changed operation and matching caller, with 0 sends, because that binding already includes `operationId`. A crash after the raw left `authorizationTx` null, and the retry stayed `historical_unknown` with 0 sends. Two RailStore instances sent twice and the state list ended `observed` then `unknown`. A found receipt left the attempt `unknown`. The first short-binding run sent 0 because a copied broadcast-attempt was still present. That setup log is `pre-amendment-setup-artifact.log`.

The amended direct-rail tests refuse those envelope and business substitutions with 0 sends and the prior obligations intact. Current recovery, close/reopen, and the crash retry each keep one signature and send the original raw once. Two instances and same-store `Promise.all` each have one send claimant and a terminal `observed`. A delayed completion leaves `observed` in place. Receipt discovery promotes `unknown` with 0 sends.

## Commands and exits

Serial. No model children. No skips. Owner tests are evidence for Root. A green run is not source or financial acceptance.

| Command | Exit | Result |
| --- | --- | --- |
| `node --max-old-space-size=768 --test-concurrency=1 --test vendor/hosted-wallet-market/test/capability-composition.test.mjs` | 0 | 12 pass, duration_ms 708.513106 |
| `node --max-old-space-size=768 --test-concurrency=1 --test vendor/hosted-wallet-market/test/retained-intent.test.mjs` | 0 | 7 pass, duration_ms 313.761245 |
| `node --max-old-space-size=768 --test-concurrency=1 --test vendor/hosted-wallet-market/test/historical-authority.test.mjs` | 0 | 1 pass, duration_ms 27856.153844 |
| `H103010_CLIENT=/tmp/h113010-owned/client/cold-requester-0.3.1.mjs H103010_DESCRIPTOR=/tmp/h113010-owned/client/descriptor-aa861e98.json node --max-old-space-size=768 server/scripts/test-h103010-capability-composition.mjs` | 0 | `{"ok":true,"accounts":2,"obligations":1,"debt":0,"quotes":0,"selections":2,"posts":1,"paidRefused":true,"predecessorBound":true}` |
| `node --max-old-space-size=768 --test-concurrency=1 --test server/scripts/test-h103010-fork-proxy.mjs` | 0 | 2 pass, duration_ms 881.311514 |
| `node --max-old-space-size=768 --test-concurrency=1 --test tools/ops/machine-market-operator/test/historical-lineage.test.mjs` | 0 | 1 pass, duration_ms 40.275981 |
| `H104010_SDS_ROOT=/home/ubuntu/ae14-work/h115010 node --max-old-space-size=768 --test-concurrency=1 --test tools/ops/machine-market-operator/test/operator.test.mjs` | 0 | 6 pass, duration_ms 126843.241285, receipt `sdsHead` `58b21010c69f9e5713e39fb2ee0b267eb9118d8c` |
| funded owned-fork replay below | 0 | 2 synthetic signatures, custody 1000000, capture 950000, fee 50000, grant removal then `machine_authority_required` |

Funded command, from the SDS checkout, `node --max-old-space-size=768 server/scripts/h103010-owned-fork-replay.mjs`, after the money and grant commits:

- `H103010_CAST=/tmp/h113010-owned/bin/cast`
- `H103010_ANVIL=/tmp/h113010-owned/bin/anvil`
- `H103010_FORK_BLOCK=53412211`
- `H103010_LOG_DIR=/tmp/h113010-owned/logs/funded-58b21010`
- `H103010_OPERATOR_ENTRY=/home/ubuntu/ae14-work/h115010-companion/tools/ops/machine-market-operator/src/open-machine-authority.mjs`
- `H103010_OPERATOR_COMMIT=015b83916d9e7d8d52c8681c276bf29e855e9efb`
- `H103010_CLIENT=/tmp/h113010-owned/client/cold-requester-0.3.1.mjs`
- `H103010_CLIENT_SHA256=accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`
- `H103010_DESCRIPTOR=/tmp/h113010-owned/client/descriptor-aa861e98.json`
- `H103010_NODE_MODULES=/home/ubuntu/ae14-work/h115010/vendor/hosted-wallet-market/node_modules`
- `H103010_SDS_COMMIT=58b21010c69f9e5713e39fb2ee0b267eb9118d8c`

Anvil 1.8.7 commit `985eeea031d79922cd654d4e94e6c3701e1c7d73`, sha256 `a2b871bf01b45d755ee37380ed11e369639a4fd9963604ed40749e299390bb9b`. Cast sha256 `2edb70a8b90ce0ed8ae3329dba1c8aeaad017f1a8d8c2e5b4131192c1d51fb96`. Public client 30187 bytes, sha256 `accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`. Descriptor 2327 bytes, sha256 `1b6e9c1099f1420d53564674f71e15544333812dcc2c682062aae7af2f5295c4`. Fork ancestor `53412211` / `0x6f50eea711bc1a20239c6a9350e44a2f7f3ae96432ffb3a8f1946252a3429e79`. Anvil finalized on this fork was head minus local finality distance, block `0x32f0133`. Proxy gap 50ms, 240 reads, 11 optional probes, 0 failures, 0 denied. Started `2026-11-02T17:23:55.508Z`, ended `2026-11-02T17:24:19.554Z`. Stdout `txId` `0xa57cbcbadde12fcaf1484dfa7c8d98b1c5c70716e786e8243f67364a06468c63`, payer delta 1000000, custody delta 1000000, capture fee 50000, contributor net 950000.

The predecessor journals store the signed raw. The historical fixture reads envelope fields from that raw when it builds the grant manifest. Recovery still refuses a manifest manufactured from the mutable candidate during `authorize`.

## Limits and cleanup

Aggregate estimate 2097152 KiB. The measured reserve was left unchanged. Anvil exited 0. The system PostgreSQL 16 cluster is down. Disposable clusters and the fork proxy exited with the harness. `node_modules` stayed untracked. The companion `node_modules` symlink stayed untracked. No force, reset, or shallow history rewrite. No live signer, key, grant enrollment, funding, payment, account change, external contact, merge, or deploy.

## File inventory

SDS tested money `58b21010c69f9e5713e39fb2ee0b267eb9118d8c`:

- `server/foundry/activation/private-control-pin.json`
- `vendor/hosted-wallet-market/contracts/machine-runtime.json`
- `vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/local-chain.js`
- `vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/rail.js`
- `vendor/hosted-wallet-market/src/machine-money.mjs`
- `vendor/hosted-wallet-market/test/historical-authority.test.mjs`
- `vendor/hosted-wallet-market/test/retained-intent.test.mjs`

Companion grant source `015b83916d9e7d8d52c8681c276bf29e855e9efb`:

- `tools/ops/machine-market-operator/src/grant.mjs`
- `tools/ops/machine-market-operator/src/open-machine-authority.mjs`
- `tools/ops/machine-market-operator/test/historical-lineage.test.mjs`

Companion receipt `f16091ccde8b685fc394dec9e27a08b996b853cb`:

- `tools/ops/machine-market-operator/export/h103010-companion-attestation.json`
- `tools/ops/machine-market-operator/export/h103010-companion-receipt.json`

Docs/export commit on the SDS branch: this file, `AE25-EXPORT.md`, and `vendor/hosted-wallet-market/export/h115010/`. The `*.log` files are force-added because the repository ignores that suffix.

- `pre-amendment-countercases.mjs` 22301 bytes `b8c2825f7e147a6581d897d8f2ed01d714136fef1c7b7213cfa36f8ddfc963db`
- `pre-amendment-countercases.log` 5901 bytes `f3e9879481362f078cda1f70ed6c8ecdb0ef83eb9fb239e0272506bd994dbfd0`
- `pre-amendment-setup-artifact.log` 5839 bytes `0b730dedbf01a652db3925e3097c2dfb1f3a4511baab1ccd9f700a22d4dd3fe0`
- `capability-composition.log` 2515 bytes `2d4ca4a57be10291cd74d48f8548b6f0818eca0d18772f53198e6e714cec4423`
- `retained-intent.log` 1692 bytes `c33e3d0e252c172d970ff405cd75f53cb865e3935837b3695d5d4a7b1d2ce2f3`
- `historical-authority.log` 650 bytes `6732c61077fbb9ecd2c38480ff32ef7084865fa0371ab48ae019937dc9f72c6b`
- `composition-harness.log` 136 bytes `f38bb8e025f843f38afd52fb8e7fdc59c417a8c392a826ca1808ece09b5eb34f`
- `fork-proxy.log` 676 bytes `cf2cd128d1fcfe0aaf472bee1312ea381f4eb1ef75d31cdc94620374606f54eb`
- `historical-lineage.log` 321 bytes `37dccde595225282498a275ff1c0f60f6a722d0678275f974808dad657bb250a`
- `operator.log` 1462 bytes `817bed4f348ba7fc4d3b841a23879346034f96377ae2fd400d97f6006c3358df`
- `funded.stdout.log` 1102 bytes `00411ff0ad4ec968a4e6c564eb6bb1a5ee4df0ccd20e8df5be95cd4d215778b1`
- `funded.stderr.log` 1409 bytes `3a6a800ad205f637df9120532578ebd6fe2e8f8a6bb7dc343550418a906fd17c`
- `funded-replay.stdout.log` 1109 bytes `ffc7cde63aee0663f4eac3c898292add64f60281d386deca8b7261900db10510`
- `summary.json` 1897 bytes `3f054945d704390e69e175de6514e4d23cd4fa5a21bcd74223097b661954615e`
- `proxy.jsonl` 90916 bytes `6d41950c0b3dfc5a7f97c08b5074004ddcf641a5e0ec34b32de793e6c551de80`
- `anvil.stdout.log` and `anvil.stderr.log` empty, sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

## NEXT

Root owns receiving, release, and the current control documents. Production remains `aa861e980df0f75a782ff30996450cf15870f2e7` with public, funded, and payment flags off. The next receiving pass is a clean import and a direct rail recovery on these two heads. A push and this owner fixture leave source and financial acceptance open.
