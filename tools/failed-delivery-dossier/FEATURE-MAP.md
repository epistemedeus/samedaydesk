# FEATURE-MAP — failed-delivery evidence dossier (W4-commerce-06)

Own directory: `tools/failed-delivery-dossier/` only.

Read-only packer. Labels `wrapper-receipt | checkout-intake | extract-unpaid`. Never refunds, never retries payment, never calls Stripe, never sends PAYMENT-SIGNATURE.

## User goals

| User goal | Entrypoint | Command | State | Tests | Account |
| --- | --- | --- | --- | --- | --- |
| Why a useful-jobs delivery is not in hand | `bin/dossier.mjs` `lib/pack.mjs` | `node tools/failed-delivery-dossier/bin/dossier.mjs pack --wrapper-receipt … --checkout-intake … --extract-unpaid …` | `sold: false`, three labelled evidence items | `test/journey.test.mjs` | None |
| Refuse SAMPLE labelled delivered | same | pack that fixture | `sample_labelled_delivered` | `test/seeded-failures.test.mjs` | None |
| Refuse buyerClass as revenue | same | `--revenue-total` or mix JSON | `buyerclass_revenue_mix` | same | None |
| Refuse refund | CLI `--refund` | same | exit 2 `refund_refused` | same | None |
| Local HTTP checkout intake | `lib/capture-checkout-http.mjs` | spawned from `test/local-runtime.test.mjs` | `fulfillmentPending: true`, `intake_required` | `test/local-runtime.test.mjs` | Fixture Stripe key only; not live Stripe |

## Pins (current runtime)

| Item | Value |
| --- | --- |
| SDS main | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| F08 receipt pin | `fable/f08-paid-wrappers` `bae3e7cd5034b21019fb272a99d88db964b831ee` (absent on main; fixture + optional read-only worktree) |
| Checkout | `server/lib/fulfill.js`, `server/scripts/test-checkout-http-lifecycle.js`, `server/routes/checkout.js` |
| Extract unpaid stop | `fixtures/buyer-runtimes/agent402/states/stop.json` |
| I01 terms | Neo PR54 content-hash `sha256:` + 64 hex. Integer `termsVersion` refused. F01 kernel not copied. |

## Files

| Path | Role |
| --- | --- |
| `bin/dossier.mjs` | Public CLI |
| `lib/pack.mjs` | Packer |
| `lib/adapters.mjs` | Injected source parsers |
| `lib/later-bindings.mjs` | Root integration bindings after merge |
| `lib/capture-checkout-http.mjs` | Local HTTP capture (fixture Stripe) |
| `fixtures/` | Copied / captured evidence |
| `test/*.test.mjs` | Journey, seeded fails, local-runtime |

## Later bindings (Root)

See `lib/later-bindings.mjs`. F08 merge: keep schema pin, do not import `wrapper.mjs`. W4 siblings: inject `adapters`. I01 remains terms owner.
