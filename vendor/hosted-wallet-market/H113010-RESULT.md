# H113010 result

New native session `931f286b-838b-4a0c-8530-32507123d049` on host `bc-24d83a2d-7cac-4e0d-bbb5-dd20adb30e09`. This is not a resume of `6a0bff09`. Checkpoint `2026-11-02T14:05:00Z` and requiredUntil `2026-11-02T14:20:00Z` stayed frozen.

## Heads

SDS `codex/h103010-mixed-capability-composition-20261101` tested source `ec3431955f2cb96053b242326a67a0c558d502c8`, parent `f2922c2272e8ab04cec8d70f1ce4f1a7a82c0578`. This document commit is a later docs/export commit. It does not change the pinned money, rail, runtime, or host bytes that the tests ran.

Pilot companion `codex/h103010-operator-integration-20261102` `b4dbee3e2e2093707b88e03433735bf2aed0bb35`, parent `56595f85bc588dea6a1da7222f55f07ea294e96c`. Ancestry from the operator integration root: `33b96cd8`, `e00f5d5f`, `6bab3f36`, `76dd9870`, `56595f85`, `b4dbee3e`.

`installedSourceSha256` `50c6980a9de3afed789b88ecf54392f1160d53ce45f70b575cb3bd429bfd8816`. `hostSourceSha256` `4d78e4f305ea0da1d89e9c155411b59899530a18ee628332b2e2a1133233c485`.

Pin bytes at the tested source:

- `vendor/hosted-wallet-market/src/machine-money.mjs` `98b21b5641c62ce1787e55774ca2397e7397c055ea7810ff5163b96aa586d3ae`
- `runtime/agent-economy-rail/dist/local-chain.js` `580d5af019842105ddcb0b1977c9b6456074550ff28e47eacb54161fe605fb73`
- `runtime/agent-economy-rail/dist/rail.js` `aaba30529e2b958660eed72dab2dedc840f3d0c7fe1d999d4f691a685a66a53a`
- `contracts/machine-runtime.json` `070f16eb1feee893a0a4117b7eeb8003bec29c46d780a38b921d70e60cd65763`

## Outcome

Historical recovery needs two proofs. The retained lineage recomputes the predecessor closure, including `nativeBudget` only when that bound carried it. The current grant is replay permission of the original raw bytes. The known commits `aa861e980df0f75a782ff30996450cf15870f2e7` and `290414e614f781357d41565258f4666208f5d70b` are fixture inputs, not a production allowlist.

The current companion refuses both predecessors before a signature. `aa861e98` has no `withOperation`, so the refusal is `outside_operation_scope`. `290414e6` binds only `proofId` plus calldata, so the current extended binding refuses `canonical_mismatch`. Signed bytes for those two commits come from that commit's own grant-shaped `openQualifiedMoney`. Recovery uses current money, the current companion, a current source/host grant at epoch 2, and lineage built from the closure that signed. Each positive recovery sends the original raw once. A retry with a receipt sends 0. Possible-send-unknown stays `unknown` and does not send again.

Missing witness, malformed witness, wrong source, wrong host, wrong epoch, wrong operator, changed fee limit, missing lineage, empty lineage, wrong quote, changed payment, and changed funding operation stay `historical_unknown` with raw bytes, binding, nonce, hold, allocation, payment, and funding operation preserved, and with 0 sends.

A machine-authority broadcast that has no witness returns null and does not send. Wallet identity has no `authorizeIntent` and is unchanged. The AMEND5 proxy still spaces upstream starts at 50ms, preserves provider errors, and does not forward `anvil_nodeInfo` or `eth_getAccountInfo`.

## Commands and exits

Serial. No model children. No skips.

| Command | Exit | Result |
| --- | --- | --- |
| `node --test-concurrency=1 --test vendor/hosted-wallet-market/test/capability-composition.test.mjs` | 0 | 12 pass, duration_ms 601.466878 |
| `node --test-concurrency=1 --test vendor/hosted-wallet-market/test/historical-authority.test.mjs` | 0 | 1 pass, duration_ms 26625.456189 |
| `H103010_CLIENT=.../cold-requester-0.3.1.mjs H103010_DESCRIPTOR=.../descriptor-aa861e98.json node --max-old-space-size=768 server/scripts/test-h103010-capability-composition.mjs` | 0 | `{"ok":true,"accounts":2,"obligations":1,"debt":0,"quotes":0,"selections":2,"posts":1,"paidRefused":true,"predecessorBound":true}` |
| `node --test-concurrency=1 --test server/scripts/test-h103010-fork-proxy.mjs` | 0 | 2 pass, duration_ms 858.392504 |
| `node --test-concurrency=1 --test tools/ops/machine-market-operator/test/historical-lineage.test.mjs` | 0 | 1 pass, duration_ms 122.671481 |
| `H104010_SDS_ROOT=/home/ubuntu/ae14-work/h113010 node --test-concurrency=1 --test tools/ops/machine-market-operator/test/operator.test.mjs` | 0 | 6 pass, duration_ms 123005.021769, receipt `sdsHead` `ec3431955f2cb96053b242326a67a0c558d502c8` |
| funded owned-fork replay below | 0 | 2 synthetic signatures, custody 1000000, capture 950000, fee 50000, lost-response replay stayed at 1 fund signature, grant removal then `machine_authority_required` |

Funded command, from the SDS checkout, `node --max-old-space-size=768 server/scripts/h103010-owned-fork-replay.mjs`:

- `H103010_CAST=/tmp/h113010-owned/bin/cast`
- `H103010_ANVIL=/tmp/h113010-owned/bin/anvil`
- `H103010_FORK_BLOCK=53412211`
- `H103010_LOG_DIR=/tmp/h113010-owned/logs/funded-ec343195`
- `H103010_OPERATOR_ENTRY=/home/ubuntu/ae14-work/h113010-companion/tools/ops/machine-market-operator/src/open-machine-authority.mjs`
- `H103010_OPERATOR_COMMIT=b4dbee3e2e2093707b88e03433735bf2aed0bb35`
- `H103010_CLIENT=/tmp/h113010-owned/client/cold-requester-0.3.1.mjs`
- `H103010_CLIENT_SHA256=accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`
- `H103010_DESCRIPTOR=/tmp/h113010-owned/client/descriptor-aa861e98.json`
- `H103010_NODE_MODULES=/home/ubuntu/ae14-work/h113010/vendor/hosted-wallet-market/node_modules`
- `H103010_SDS_COMMIT=ec3431955f2cb96053b242326a67a0c558d502c8`

Anvil 1.8.7 commit `985eeea031d79922cd654d4e94e6c3701e1c7d73`, sha256 `a2b871bf01b45d755ee37380ed11e369639a4fd9963604ed40749e299390bb9b`. Cast sha256 `2edb70a8b90ce0ed8ae3329dba1c8aeaad017f1a8d8c2e5b4131192c1d51fb96`. Public client 30187 bytes, sha256 `accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`. Descriptor 2327 bytes, sha256 `1b6e9c1099f1420d53564674f71e15544333812dcc2c682062aae7af2f5295c4`. Fork ancestor `53412211` / `0x6f50eea711bc1a20239c6a9350e44a2f7f3ae96432ffb3a8f1946252a3429e79`. Anvil finalized on this fork was head minus local finality distance, block `0x32f0133`, not the public finalized tag. Proxy gap 50ms, 240 reads, 12 optional probes, 0 failures, 0 denied. Started `2026-11-02T13:48:27.800Z`, ended `2026-11-02T13:48:50.713Z`.

Closed bytes are in `vendor/hosted-wallet-market/export/h113010/`:

- `funded.stdout.log` 1102 bytes `7f67d5e84549c6d94573243a9b3fffc590256df879e2a773751dd816788ef7b9`
- `funded.stderr.log` 1409 bytes `c684a871dad55966a94dadf5861badeb01308e40b20787f0bee4327f3cd88f13` (node warnings only)
- `summary.json` 1897 bytes `43d6c4481eb6dc0714f2d1252c41aa6f323701417763fa0748a636f4bb34fdf5`
- `proxy.jsonl` 91168 bytes `857aee17940c5b7f579587e307f0b3b45d5152b6c90240c249ac9e2ca088a1af`
- `anvil.stdout.log` and `anvil.stderr.log` empty, sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

## File inventory

SDS source commit `ec3431955f2cb96053b242326a67a0c558d502c8`:

- `server/foundry/activation/private-control-pin.json`
- `server/scripts/test-h103010-capability-composition.mjs`
- `server/scripts/test-h103010-funded-fork.mjs`
- `vendor/hosted-wallet-market/contracts/machine-runtime.json`
- `vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/local-chain.js`
- `vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/rail.js`
- `vendor/hosted-wallet-market/src/machine-money.mjs`
- `vendor/hosted-wallet-market/test/capability-composition.test.mjs`
- `vendor/hosted-wallet-market/test/historical-authority.test.mjs`

Companion commit `b4dbee3e2e2093707b88e03433735bf2aed0bb35`:

- `tools/ops/machine-market-operator/src/grant.mjs`
- `tools/ops/machine-market-operator/src/open-machine-authority.mjs`
- `tools/ops/machine-market-operator/test/historical-lineage.test.mjs`
- `tools/ops/machine-market-operator/export/h103010-companion-attestation.json`
- `tools/ops/machine-market-operator/export/h103010-companion-receipt.json`

Docs/export commit on the SDS branch: this file, `AE25-EXPORT.md`, and `vendor/hosted-wallet-market/export/h113010/`.

## NEXT

Root owns receiving and release. Production remains `aa861e980df0f75a782ff30996450cf15870f2e7` with public, funded, and payment flags off. No merge, deploy, live key, grant enrollment, or payment was performed.
