# H154540 coherent AGL integration

Status: source export on `codex/h154540-agl-integration-20261105`. Base `90939f157fcb33606c0f5ccfbffbc10b9e51e64a`. Successor of H154510 at `1264ef594ca8fe264e5b82d3f8c133ce6344c338`. That report stays at `experiments/agl-coherent-receiving-20261105/` on that commit. This writer does not replace it.

## Result

The installed 0.3.1 client is the one acquisition path. Stored useful bodies are digested at bind and checked before reuse, residual projection, and portable export.

Canonical client: `server/scripts/fixtures/h142010-cold-requester-0.3.1.mjs`, 30187 bytes, sha256 `accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`. Descriptor `docs/machine-promotion/evidence/private-successor-descriptor.json` sha256 `2edea980c57909e8715cac1c899c1e4886f418614a71a79e50df113e4bd28d25`, version 0.3.1, `publicationStatus` `private_unreleased`, `hostedAcquisitionVerified` false. Acquire readback: `accountCreated` false, `money` unfunded, `participation` `voluntary-artifact-v1`, `clientSha256` matches the fixture. The profile GET in the test is an in-process stub, so this is source readback, not a live hosted acquire.

Old client `vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs` sha256 `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4` reports version 0.3.0 and returns `acquisition_refused` against the 0.3.1 descriptor. A changed byte identity of the installed file returns `acquisition_client_mismatch` and performs no HTTP. Signup without a descriptor returns `acquisition_required` and writes no secret file. `fund` against the stub 404 returns `paidWork` false, `code` `not_found`, `proofId` `unfunded`.

`vendor/hosted-wallet-market/src/machine-money.mjs` sha256 `059ac16fc3f4a8855bfa4e9d0c5c14840586d648247f66f5c6b0b5997396e54d` and `vendor/hosted-wallet-market/src/seed.mjs` sha256 `ecf605d362916ba1e00f718c4b5167d8945d514820c78f104d7435a4ff355c4c` are unchanged. `vendor/hosted-wallet-market/test/historical-authority.test.mjs` sha256 `35a7a975339b38915aeba7c6c8edf582f11a82e25f94d884c3c92fa1779b5d81` still requires `H103010_OPERATOR_ENTRY` and `H103010_HISTORICAL_CACHE` as absolute files at import. This run did not set those variables and did not fabricate the cache. `node_modules/viem` is absent, so that test was not executed.

Useful body: `bindUsefulDecision` stores `decisionBinding.usefulBodyDigest`. `decideOrReuse` verifies it after the existing identity, recipe, revision, clock, and input-digest gates, and before a reuse return. A missing digest is `integrity_unknown` and the row is left as stored. A changed outcome or `evidence.contentHash` is `integrity_mismatch`, `producerInvoked` false, and the tampered body is omitted. Input drift remains `digest_mismatch`. A stale clock remains `stale_clock`. An unsupported recipe remains `input_not_before_work`.

Portable export copies `producerBodyDigest` and refuses a missing or mismatched stored body. Import returns `integrity_unknown` when that field is absent and `integrity_mismatch` when the body differs. An actor who rewrites both the useful body and the digest, then reseals the portable file, is undetected. The digest is corruption detection. No signing authority was added.

Residual routing follows the recipes that exist. `source-change-alert` keeps the field split: answered fields `direct`, capture-held fields `direct_rerun`, absent fields an unsent `residual_need` with `paymentAuthority` none, `paidWork` false, `debtCreated` false, `sent` false. `verification-reconcile` with a named want returns `recompute` / `unsupported_field_remainder`. An empty want on that recipe stays a whole-decision `direct` reuse. A corrupt stored body becomes `recompute` through the same reuse check. `comparable-record-extraction` stays refused.

Direct offline compare stays the default when retention has no measured benefit. Every verdict keeps `recomputeCostAvoidedNetOfUpkeep` at `costs_unknown` and `publicSafeCertified` false.

## Comparison

Single wall-clock samples. Each child includes node startup. Outcome `unchanged`. Direct recipe payment: `attempted` false, `replayBlocked` true.

Final `npm run test:result-reuse` sample, 2026-11-05T23:33:59Z: `directMs=36.318`, `reuseMs=34.177`.

Earlier samples in this same foreground: `directMs=38.146` `reuseMs=41.961`; `directMs=39.400` `reuseMs=35.204`. The faster side changes between samples.

H154510 at `1264ef59` recorded about 44.73 ms direct and 37.29 ms reuse. That pair is source evidence from that run. It is not an economic advantage, outside use, or revenue.

Source-gate hit sample from the same final run: `inputCaptureNs=76197`, `inputCaptureBytes=527`, `producerRunNs=38938831` on the one producer run that created the binding, `producerCalls=0` on the later hit.

R06 harness, designed mix: `hitRate` 0.625, `falseReuseCount` 0, `recomputeCount` 3, `retirements` 1. The checked-in `experiments/agl-r06-portable-decision-20261105/RESULT.json` is the `95c8a841` fixture. The test runs in a temp directory and does not rewrite it.

## Tests

`npm run test:result-reuse` exit 0. 70 tests, 70 pass, 0 fail, 0 skipped. `duration_ms` 2196.30415. Node v22.23.4.

Counts: export 23, decision-reuse 9, source-gate 5, shared-capture 4, portable 9, residual 6, useful-body-integrity 7, r06 harness 1, acquisition 6.

`npm run test:recurring-job-recipes` exit 1. 90 tests, 83 pass, 4 fail, 3 skipped. `duration_ms` 718.897929. The four failures and three skips are the absent sibling checkout `epistemedeus/x402-url-extractor` with package name `x402-merchant`. This package did not npm-install that tree.

Failures:

- local merchant root and packages resolve without MERCHANT_INPUT_ROOT or network
- local merchant modules export the published C31/C34 field lists
- local mocked HTTP serves published C31/C34 routes
- S25 merchant package contract rejects non-x402-merchant trees

Skips: mounted merchant E2E against C31/C34 contracts, buyer-setup-trace loopback inspection, mounted HTTP origin failure injection.

`npm run test:result-reuse:vm` was not run. This host has no Postgres. `tools/result-reuse/test-vm/residual-rails.vm.test.mjs` is in the closure and stays out of the default script. It is not a pass.

## Companions

Integrated by path checkout onto this branch. Those refs were not moved.

- Shared capture 364: `3a4a7538329292c11d94b148d58964fc0656dece`
- Residual 365: `9d1f3f9677ade404131fc62ee3e3ab99b10ec144`
- Portable 366: `95c8a84155d01d67c707170e94aa148ba6542c50`
- Client successor 367 / H154510: `1264ef594ca8fe264e5b82d3f8c133ce6344c338`

Private-control pin schema `sds.foundry.private-control-source.v1`. `base` remains `4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134`. `files.package.json` is now `c6250a9cab07b37ac0076111f0af76d7dcf63f6f3705ab9651a01bb35e579947`, the sha256 of this tree's `package.json`. Prior member `e2af16586935e92dde2dbb39e6d192e9cc5e845b692e426962891be203a4b0a4` remains the historical value in `docs/receiving/nov04-qualified-reuse-integration/RELEASE-PROPOSAL.md`. This pin edit is a source hash refresh. It is not an enrollment or a release.

## File inventory

- `package.json`: `test:result-reuse` union and `test:result-reuse:vm`
- `server/foundry/activation/private-control-pin.json`: `package.json` hash only
- `tools/result-reuse/src/export.mjs`: `usefulBodyDigest` at bind, `verifyUsefulBody` before reuse
- `tools/result-reuse/src/pins.mjs`: `integrity_mismatch`, `integrity_unknown`
- `tools/result-reuse/src/portable.mjs`: from 366, plus `producerBodyDigest`
- `tools/result-reuse/src/residual.mjs`: from 365, plus verification field alignment
- `tools/result-reuse/cli.mjs`: `residual` command and digest notes
- `tools/result-reuse/README.md`: integrity, residual, canonical client
- `tools/result-reuse/test/source-gate.test.mjs`: bound rows carry `usefulBodyDigest`
- `tools/result-reuse/test/shared-capture-two-decisions.test.mjs`: from 366
- `tools/result-reuse/test/portable-decision.test.mjs`: from 366
- `tools/result-reuse/test/residual-need.test.mjs`: from 365
- `tools/result-reuse/test/useful-body-integrity.test.mjs`: new
- `tools/result-reuse/test-vm/residual-rails.vm.test.mjs`: from 365, not executed here
- `experiments/agl-r06-portable-decision-20261105/`: from 366, `RESULT.json` left as that fixture
- `experiments/agl-coherent-integration-20261105/test/acquisition.test.mjs`
- `experiments/agl-coherent-integration-20261105/test/profile-stub.mjs`
- `experiments/agl-coherent-integration-20261105/RESULT.md`
- `experiments/agl-coherent-integration-20261105/receipt.json`

Unchanged sources this outcome depends on: the installed 0.3.1 fixture, the 0.3.0 client, the descriptor, `machine-money.mjs`, `seed.mjs`, `historical-authority.test.mjs`, and `vendor/hosted-wallet-market/examples/GUIDE.md`. The examples client at 1264ef59 (`vendor/hosted-wallet-market/examples/cold-requester-0.3.1.mjs`, 34016 bytes, sha256 `ad133fb820d794fb49eff6767153cd3f42202d4259e434214d9a9a4798f5fa0e`, version label 0.3.1) is absent from this branch.

## Exclusions held

No payment authority, live commission, default merge, deployment, public contact, human-facing page, new market, new account store, new ledger, new client version, or new descriptor. No second 0.3.1 acquisition path. The stub profile is not a signup success. Original 364-367 writers stay on their commits.

## Next

Root owns public hosting, the actual machine release, and contact.

A later client that adds accepted-work or multi-criterion post needs a separately received release: a new version label, descriptor bytes, and sha256 that match that file. The 1264ef59 examples bytes are unqualified against the installed 0.3.1 descriptor (`acquisition_client_mismatch`).

Re-run `npm run test:result-reuse:vm` on a host with disposable Postgres. Leave historical-authority on its H103010 fixture custody. Host-pin enrollment is a separate receiving step. The `package.json` member above is the only pin change.

Checkpoint frozen at admission: `2026-11-06T00:40:00Z`. `requiredUntil` `2026-11-06T00:55:00Z`. This export was measured at `2026-11-05T23:33:59Z`.
