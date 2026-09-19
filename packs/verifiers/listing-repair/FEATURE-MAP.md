# Feature map — SDS listing-repair bind (R14-07)

Write boundary: `packs/verifiers/listing-repair/**` only.

| ID | Intent | This pack | Status |
| --- | --- | --- | --- |
| R14-07 | Bind oracle to real 1.4.7 `repair-packet.json` (owner-repair actions + source digest) | `src/verify.mjs`, `src/bind.mjs` (`caller.input` / `--bind` pair), `scripts/cold-bind.mjs` | Implemented |
| R14-01 | Sibling oracle CLI (synthetic `sourceObservation` / field rows) | Not copied; this bind judges unmodified engine packets | Parallel PR #159 |
| Engine | `listing-repair-packet` in useful-jobs 1.4.7 | **Read-only** — extract and run; do not republish | Pin `e2e9b44e…69dec` |

## Surfaces

| Capability | Path |
| --- | --- |
| CLI | `bin/listing-repair-verifier.mjs` |
| Cold bind runner | `scripts/cold-bind.mjs` |
| Library | `src/verify.mjs` `verifyListingRepair` |
| Source digest bind | `src/bind.mjs` |
| Captured engine packets | `fixtures/cold/*.packet.json` |

## Explicitly not this pack

- Reimplementing `listing-repair-packet` / distribution-repair
- Republishing useful-jobs 1.4.7
- Stripe / x402 spend, price/SKU, Bazaar/catalog/`client/public` write
- Live HTTP publish, merge to main
- neomorphic-io checkout or write
