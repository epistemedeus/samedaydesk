# Price-drift verifier

Offline JSON CLI that **records** live SameDayDesk x402 amounts and
**rejects observation drift**. It does not rewrite catalog prices, does not
pay, does not publish, and does not checkout.

Write boundary: `packs/verifiers/price-drift/**` on `epistemedeus/samedaydesk`.
Node ≥ 22. Zero npm dependencies.

Recorded live SKUs (not changed by this pack):

| Route | Display | Atomic |
| --- | --- | --- |
| `/extract` | `0.005` USDC | `5000` |
| `/commerce/seller-integrity-audit` | `0.01` USDC | `10000` |

Also recorded from the committed catalog: `/read` and
`/commerce/payment-offer-preflight` at `0.005` / `5000`.

## Literal cold run

```sh
cd packs/verifiers/price-drift
node bin/price-drift.mjs verify \
  --pin fixtures/pin.json \
  --observation fixtures/ok-observation.json
```

Exit 0. `ok: true`, `liveSdsPricesUnchanged: true`, `purchaseAuthority: false`.

```sh
node bin/price-drift.mjs doctor
```

Reads the same local fixtures. No network.

## Seeded failure

```sh
node bin/price-drift.mjs verify \
  --pin fixtures/pin.json \
  --observation fixtures/reject/extract-amount-drift.json
```

Exit 1. Extract moved from `0.005` / `5000` to `0.05` / `50000` →
`amount_drift`. The pack still reports `liveSdsPricesUnchanged: true`
because it records the pin; it does not write the catalog.

Other seeded refusals under `fixtures/reject/`:

| Fixture | Code |
| --- | --- |
| `edit-live-prices.json` | `edit_live_prices` |
| `float-money.json` | `float_money` |
| `atomic-decimal-mismatch.json` | `atomic_decimal_mismatch` |
| `missing-route.json` | `missing_required_route` |
| `extra-sku.json` | `extra_sku` |
| `network-drift.json` | `network_drift` |
| `purchase-authority.json` | `purchase_authority` |
| `checkout.json` | `checkout_attempted` |
| `publish.json` | `publish_attempted` |
| `live-http.json` | `live_http_refused` |
| `sample-as-live.json` | `sample_as_live` |
| `extra-sku-silent.json` | `extra_sku` |
| `charged-402.json` | `http_402_as_success` |
| `foreign-origin.json` | `origin_drift` |

A pin that redefines recorded live amounts (extract `0.005` → `0.05`) is
`pin_live_mismatch`, even if the observation matches that pin.

`--live`, `--publish`, `--checkout`, `--pay`, and `https://` input paths
exit 2.

## Honesty

Money is decimal strings (USDC, six decimals). Atomic `5000` is `0.005`
USDC, not 5000 dollars. HTTP 402 is unpaid, never success.
`purchaseAuthority` stays false. Missing pin evidence stays unknown.

```sh
node --test --test-concurrency=1 tests/*.test.mjs
```
