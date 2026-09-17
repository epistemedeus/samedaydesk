# Feature map — SDS listing-repair verifier (R14-01)

Write boundary: `packs/verifiers/listing-repair/**` (+ optional root `package.json` script wire).

| ID | Intent | This pack | Status |
| --- | --- | --- | --- |
| R14-01 | Listing-repair oracle over useful-jobs 1.4.7 packets | `src/verify.mjs`, `bin/listing-repair-verifier.mjs` | Implemented |
| Neo PR51 | Source shape (1.0.0 corrections[]) | Ported + adapted to actions[] | Read-only reuse |
| Engine | listing-repair-packet / distribution-repair | **Out of scope** — do not ship a second engine | — |

## Surfaces

| Capability | Path |
| --- | --- |
| CLI | `bin/listing-repair-verifier.mjs` |
| Library | `src/verify.mjs` `verifyListingRepair` |
| Honesty flags | `src/honesty.mjs` (inlined; no capability-preflight dep) |
| Cold 1.4.7 example | `fixtures/cold/` |
| Seeded rejects | `fixtures/reject/` |
| Adversarial | `fixtures/adversarial/` (≥6) |

## Explicitly not this pack

- Reimplementing `listing-repair-packet` / distribution-repair
- Stripe / x402 spend, price/SKU, Bazaar/catalog/client/public write
- Live HTTP publish, merge to main
