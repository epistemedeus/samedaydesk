# FEATURE-MAP — failed-delivery evidence dossier (W5-D21 / Co06)

Own directory: `tools/failed-delivery-dossier/` only.

Read-only packer. Labels `wrapper-receipt | checkout-intake | extract-unpaid`. Never refunds, never retries payment, never calls Stripe, never sends PAYMENT-SIGNATURE.

Published observation contract: `lib/observation.mjs` `OBSERVATION_CONTRACT`. Expected 402 is never `observationStatus: observed`. Unrun checks have `pass: false` and `observed: false`.

## User goals

| User goal | Entrypoint | Command | State | Tests | Account |
| --- | --- | --- | --- | --- | --- |
| Why a useful-jobs delivery is not in hand | `bin/dossier.mjs` `lib/pack.mjs` | `node tools/failed-delivery-dossier/bin/dossier.mjs pack --wrapper-receipt … --checkout-intake … --extract-unpaid …` | `sold: false`, three labelled evidence items | `test/journey.test.mjs` | None |
| Label catalog 402 as expected, not observed | same | pack `extract-402-contract.json` | `observationStatus: expected` | `test/observation.test.mjs` | None |
| Capture local unpaid 402 | `lib/capture-extract-402-http.mjs` | spawned from tests | `observationStatus: observed`, live extract still `unrun` | `test/observation.test.mjs` | None |
| Refuse SAMPLE labelled delivered | same | pack that fixture | `sample_labelled_delivered` | `test/seeded-failures.test.mjs` | None |
| Refuse buyerClass as revenue | same | `--revenue-total` or mix JSON | `buyerclass_revenue_mix` | same | None |
| Refuse refund | CLI `--refund` | same | exit 2 `refund_refused` | same | None |
| Refuse official claim without evidence | same | pack official-source fixture | `official_source_without_evidence` | same | None |
| Verify pin worktrees | CLI `--verify-pins` | same | F08 capture SHA and SDS52 SHA, not equal | `test/observation.test.mjs` `test/local-runtime.test.mjs` | None |
| Local HTTP checkout intake | `lib/capture-checkout-http.mjs` | spawned from `test/local-runtime.test.mjs` | `fulfillmentPending: true`, `outcomeKind: incomplete-delivery` | `test/local-runtime.test.mjs` | Fixture Stripe key only; not live Stripe |

## Pins (current runtime)

| Item | Value |
| --- | --- |
| SDS main (claimed, not re-verified here) | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| F08 receipt capture pin | `bae3e7cd5034b21019fb272a99d88db964b831ee` (fixture CLI capture; absent on main) |
| SDS52 current wrapper | `aeef964fa188443078958d9d6d393afae1d542ee` PR52 `fable/f08-paid-wrappers` (read-only worktree; schema only; not copied) |
| Checkout | `server/lib/fulfill.js`, `server/scripts/test-checkout-http-lifecycle.js`, `server/routes/checkout.js` |
| Extract unpaid stop | `fixtures/buyer-runtimes/agent402/states/stop.json` |
| I01 terms | Neo PR54 content-hash `sha256:` + 64 hex. Integer `termsVersion` refused. F01 kernel not copied. Golden hash not re-verified at `346bbd3c`. |

## Files

| Path | Role |
| --- | --- |
| `bin/dossier.mjs` | Public CLI |
| `lib/pack.mjs` | Packer |
| `lib/observation.mjs` | Expected vs observed vs unrun contract |
| `lib/source-status.mjs` | Pin worktree verification; unrun is not a pass |
| `lib/adapters.mjs` | Injected source parsers |
| `lib/later-bindings.mjs` | Root / W5-D01 integration bindings |
| `lib/capture-checkout-http.mjs` | Local HTTP checkout capture (fixture Stripe) |
| `lib/capture-extract-402-http.mjs` | Local HTTP 402 capture (not live extract) |
| `fixtures/` | Copied / captured evidence |
| `test/*.test.mjs` | Journey, seeded fails, local-runtime, observation |

## Later bindings (W5-D01 / Root)

See `lib/later-bindings.mjs`. Consume receipt schema only. Do not import `wrapper.mjs`. I01 remains terms owner. Live extract stays unrun until an external capture exists.
