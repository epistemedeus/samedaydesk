# RECEIPT — W0-R14-04 pre-spend cost assurance

Tool: `tools/pre-spend-cost-assurance/`
Job: `W0-R14-04-pre-spend-cost-assurance`
Spec: SDS PR57 https://github.com/epistemedeus/samedaydesk/pull/57
Branch: `heavy/w0-r14-04-pre-spend-cost-assurance`
Base: `main` (current checkout)
Node: v22.22.2

## Outcome

A local **pre-spend** CLI that lists required tools/accounts and a
**decimal-string** USDC cap for an unpaid extract + seller-integrity-audit
plan. `purchaseAuthorized` is always `false`. `settle` / `prepare` are
refused. Invalid delivery is not a reason to spend. Neo is not attached.

## Pins

| Item | Value |
| --- | --- |
| Write repo | epistemedeus/samedaydesk `main` |
| Own directory | `tools/pre-spend-cost-assurance/` (new on this branch) |
| B04 | Neo `packs/price-arithmetic-verifier/` — **not attached**; fixture import shape used |
| F08 | `server/paid-useful-jobs/` — not rewritten |
| Live extract | `$0.005` atomic `5000` unchanged |
| Live seller-integrity-audit | `$0.01` atomic `10000` unchanged |
| Network | Base USDC `eip155:8453` |
| `server/pricing.js` / homepage | not edited |

## RECEIPT contradictions

Neo B04 is not on this checkout. Money helpers are loaded from
`fixtures/b04-price-arithmetic-verifier/` (same `atomicToDecimal` /
`decimalToAtomic` / `moneyScale` shape). Sibling neo paths are not probed.
F08 wrappers are not in this `main` tree and were not copied.

## Advertised entry (recorded)

```sh
cd tools/pre-spend-cost-assurance
node bin/pre-spend.mjs list
```

Cap `0.015` USDC (`15000` atomic = `5000` + `10000`). `purchaseAuthorized: false`.

```json
{
  "ok": true,
  "status": "list",
  "purchaseAuthorized": false,
  "costCap": "0.015",
  "capAtomic": "15000",
  "currency": "USDC",
  "network": "eip155:8453"
}
```

Journey (`node bin/pre-spend.mjs journey --fixture fixtures/ok.json`) then
rejects a plan that would POST payment (`post_payment`).

## Tests

```sh
node --test --test-concurrency=1 tests/*.test.mjs
```

**PASS** — 22 tests, 0 fail on Node v22.22.2.

Seeded rejects:

| Fixture / `--seeded-failure` | Code |
| --- | --- |
| `default-purchase` | `default_purchase` |
| `wrong-units-5000-dollars` | `wrong_units` |
| `http-402-as-success` | `http_402_as_success` |
| `sample-as-paid-assurance` | `sample_as_paid_assurance` |
| `edit-live-prices` | `edit_live_prices` |
| `post-payment` | `post_payment` |
| `invalid-delivery-retry-spend` | `invalid_delivery_spend` |

CLI `settle` → `settle_refused`. `prepare` → `prepare_refused`.

## Honesty

`purchaseAuthorized: false`. `readyForRelease: false`. No deployment,
payment, live SDS price change, new account/chain/queue, or secrets.
