# SKU-ghost verifier

Offline Node ≥22 **oracle** for SameDayDesk billed offer slugs. A ghost SKU is
an advertised slug (homepage catalog, Payment Link key, or `llms.txt` Start
here dollar line) that is missing from `server/pricing.js`, or advertised at
the wrong cents.

This pack **records** live prices. It does not rewrite them. It does not call
checkout, Stripe, or x402. It does not publish a catalog. It does not touch
neomorphic-io.

```sh
node packs/verifiers/sku-ghost/bin/sku-ghost.mjs --committed
node packs/verifiers/sku-ghost/bin/sku-ghost.mjs --fixture packs/verifiers/sku-ghost/fixtures/seeded/ghost-sku.json
```

Stdout is JSON. Exit **0** only when advertised SKUs exist in `OFFERS` at the
same cents. Exit **2** for explicit failures (`ghost_sku`,
`sku_price_mismatch`, `silent_empty_success`, `sku_change_refused`,
`publish_attempted`, `checkout_touched`).

## Surfaces (read only)

| Role | Path |
| --- | --- |
| Authoritative SKU map | `server/pricing.js` `OFFERS` |
| Homepage catalog | `client/src/lib/services.ts` `CATEGORIES` |
| Stripe Payment Link keys | `client/src/lib/services.ts` `PAYMENT_LINKS` |
| Named dollar lines | `client/public/llms.txt` section `Start here` |

`custom_quote` is operator-variable and is not treated as a fixed SKU.
`seller_contract_repair` may exist only on the server map; **unadvertised is
not a ghost**.

## Seeded refusals

| Attempt | `failure.class` |
| --- | --- |
| Advertised slug `sku_ghost_premium` (not in `OFFERS`) | `ghost_sku` |
| Ghost slug with a real product `name` | `ghost_sku` |
| Inherited keys `toString` / `constructor` | `ghost_sku` |
| `{ok:true, advertised:[]}` | `silent_empty_success` |
| `agent_workflow` advertised at $0.05 | `sku_price_mismatch` |
| `editLivePrices: true` or `--edit-prices` (any mode) | `sku_change_refused` |
| `--publish` / `--checkout` | `publish_attempted` / `checkout_touched` |

A naive `if (doc.ok) return success` would accept the ghost-SKU fixture
because it is HTTP-shaped success JSON. This verifier loads the **real**
`server/pricing.js` and refuses it (`getOffer("sku_ghost_premium") === null`).

## Tests

```sh
node --test packs/verifiers/sku-ghost/test/*.test.mjs
```
