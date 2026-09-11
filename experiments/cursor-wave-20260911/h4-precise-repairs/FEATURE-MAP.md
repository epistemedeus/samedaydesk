## Sub-features

- **G01 exact repair proposal.** Design-only record against one of the six PR51 useful-jobs catalog ids (`api-upgrade-brief`, `vendor-budget-impact`, `feed-agenda`, `evidence-ci-annotation`, `listing-repair-packet`, `repeat-job-record`). Those jobs stay unpaid offline subjects. This pack does not wrap them as catalog offers and does not start a hosted paid job.
- **G03 supplied-input intake.** Caller fixture in → `RepairIntake` with `digestSha256` / `mediaType` / `bytes`, defect, scope, acceptance test, rollback. `provenance` is `fixture` (or `test`). `saleState` is always `not_a_sale`. SAMPLE / `--example` / fixture input cannot become `provenance=customer` or paid/settled.
- **G06 callback/metadata diagnostics.** Presence-only compare of a fixture payload to merchant PR54 (`a143898dd1ec35c097ca7eb0b472f30dad1ee319`) rules: CDP Bazaar indexes `paymentPayload.resource` + `paymentPayload.extensions.bazaar`, not sibling `paymentRequirements`. `signed: true` only for `payload`. Resource and bazaar hints are unsigned. Diagnostics never retry payment and never abort verify/settle.
- **G05 customer-funded canary design.** Emits a `CanaryDesign` with live-listed cap strings, `ownerQa: true`, `externalRevenue: false`, `authorized: false`. Design only. Live settle/purchase is refused.

## How to get to it (user POV)

Account prerequisite: none. Fixtures only.

1. Point intake at a declared mismatch fixture (example: OpenAPI/Bazaar `resource` hint missing, payload signature slot intact). You get a `RepairIntake` labeled `provenance: "fixture"`.
2. Run diagnostics on the same fixture. You get one row per field (`payload`, `resource`, `extensions.bazaar`, `other`) showing present/signed/drift. Unsigned hints are never payment-signature authority.
3. Emit a canary plan JSON. Caps match current SDS live listings (`extract` `$0.005`, `seller-integrity-audit` `$0.01`). The plan stays `authorized: false` and does not purchase.
4. Point the corpus runner at `fixtures/corpus/`. Each MONITOR/F18 id comes back as `reproduced`, `fixed_with_regression`, `briefed_out_of_scope`, or `noted`. A fixture cannot become `provenance=customer`. An `authorized=false` canary does not settle.

## Driving it with CLI

From this directory, Node 22 with type stripping:

```bash
node --experimental-strip-types bin/h4-precise-repairs.ts intake --fixture fixtures/mismatch-missing-resource.json
node --experimental-strip-types bin/h4-precise-repairs.ts diagnose --fixture fixtures/mismatch-missing-resource.json
node --experimental-strip-types bin/h4-precise-repairs.ts canary --route extract
node --experimental-strip-types bin/h4-precise-repairs.ts subjects
node --experimental-strip-types bin/h4-precise-repairs.ts proposal --subject listing-repair-packet
node --experimental-strip-types bin/repair.ts corpus --fixtures fixtures/corpus/
npm test
```

`--example` loads the bundled missing-resource fixture as a SAMPLE. Combining it with `--customer`, `--paid`, or `--settled` is rejected. `--settle` on `canary` is rejected. `corpus` loads one JSON fixture per defect id and refuses customer provenance or live settle.

## Gotchas

- Fixture / SAMPLE / `--example` input cannot enter `provenance=customer` or any sale/settled state. `saleState` is always `not_a_sale`.
- Missing `suppliedInput` (`digestSha256`, `mediaType`, `bytes`) is never a completed repair.
- `signed: true` is only valid for `payload`. Treating `resource` or `extensions.bazaar` as signature authority is a seeded failure.
- SDS at PR51 has no ResourceServer `verifyPayment` / `settlePayment` assignments. Merchant continuity lives in the copied PR54 fixture and is used as diagnostics, not as a second signer and not as a live hook install.
- Do not change live prices (`extract` `$0.005`, `seller-integrity-audit` `$0.01`) or reassign `verifyPayment` / `settlePayment`.
- `authorized: false` canaries must not call live settle. This pack stubs and refuses.
- F18 agents-gateway live probe is `GET /healthz`. `GET /health` on that gateway is unsupported. SDS Express `GET /api/health` is a different app-health route and is not rewritten.
- Unpaid HTTP 402 with extract atomic `5000` or seller-integrity-audit atomic `10000` is unpaid-held, not success.
- SAMPLE / `--example` reserved-fixture funding is rejected as not-a-sale. This pack does not implement `server/paid-useful-jobs/`.
- F01 integer `termsVersion` and F07 `harness_fixture` residuals are Neo briefs only. They are not patched on SDS.
