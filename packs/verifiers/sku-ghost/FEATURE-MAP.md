# Feature map — SDS SKU-ghost verifier

Write boundary: `packs/verifiers/sku-ghost/**` only.

| ID | Intent | This pack | Status |
| --- | --- | --- | --- |
| sku-ghost | Advertised offer slugs vs `server/pricing.js` | `src/verify.mjs`, `bin/sku-ghost.mjs` | Implemented |
| Record prices | Quote live SDS homepage SKUs without rewriting | `recorded.skus` + `liveSdsPricesUnchanged:true` | Implemented |
| Seeded ghost | Invented slug vs real `getOffer` | `fixtures/seeded/ghost-sku.json` | Implemented |

## Explicitly not this pack

- Editing `server/pricing.js` or `client/src/lib/services.ts`
- Checkout, Stripe, x402 spend, Payment Link mutation
- Publishing a catalog or touching neomorphic-io
- Treating useful-jobs / discovery packages as billed SKUs
