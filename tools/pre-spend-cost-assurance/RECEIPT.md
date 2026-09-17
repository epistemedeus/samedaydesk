# RECEIPT — W3-10 / E06 pre-spend cost assurance

Tool: `tools/pre-spend-cost-assurance/`
Branch: `fable/w3-10-e06-pre-spend-assurance`
Date: 2026-09-11
Node: v22.14.0
Base: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51)
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/57

## Outcome

A local **pre-spend** CLI that lists required tools/accounts and a
**decimal-string** USDC cap for an unpaid extract + seller-integrity-audit
plan. `purchaseAuthorized` is always `false`. `settle` / `prepare` are
refused. Invalid delivery is not a reason to spend.

## Pins

| Item | Value |
| --- | --- |
| Write repo | epistemedeus/samedaydesk `main` |
| Own directory | `tools/pre-spend-cost-assurance/` (new) |
| B04 | Neo `packs/price-arithmetic-verifier/` — **not attached**; fixture import shape used |
| F08 | `server/paid-useful-jobs/` — not rewritten |
| Live extract | `$0.005` atomic `5000` unchanged |
| Live seller-integrity-audit | `$0.01` atomic `10000` unchanged |
| Network | Base USDC `eip155:8453` |
| `server/pricing.js` / homepage | not edited |

## RECEIPT contradictions

Neo B04 is not on this checkout. Money helpers are loaded from
`fixtures/b04-price-arithmetic-verifier/` (same `atomicToDecimal` /
`decimalToAtomic` / `moneyScale` shape). F08 wrappers are not in this
`main` tree and were not copied.

## Literal journey (recorded)

```sh
cd tools/pre-spend-cost-assurance
node bin/pre-spend.mjs journey --fixture fixtures/ok.json
```

Cap `0.015` USDC (`15000` atomic = `5000` + `10000`). Honesty block omitted
for length (`purchaseAuthorized: false`, `liveSdsPricesUnchanged: true`,
`settleCalled: false`).

```json
{
  "ok": true,
  "status": "journey",
  "purchaseAuthorized": false,
  "costCap": "0.015",
  "capAtomic": "15000",
  "currency": "USDC",
  "network": "eip155:8453",
  "postPayment": {
    "ok": false,
    "code": "post_payment",
    "message": "plan would POST payment; settle/prepare are refused"
  }
}
```

## Tests

```sh
node --test --test-concurrency=1 tests/*.test.mjs
```

**PASS** — 19 tests, 0 fail on Node v22.14.0.

Seeded rejects:

| Fixture | Code |
| --- | --- |
| `reject/default-purchase.json` | `default_purchase` |
| `reject/wrong-units-5000-dollars.json` | `wrong_units` |
| `reject/http-402-as-success.json` | `http_402_as_success` |
| `reject/sample-as-paid-assurance.json` | `sample_as_paid_assurance` |
| `reject/edit-live-prices.json` | `edit_live_prices` |
| `reject/post-payment.json` | `post_payment` |
| `reject/invalid-delivery-retry-spend.json` | `invalid_delivery_spend` |

CLI `settle` → `settle_refused`. `prepare` → `prepare_refused`.

## Honesty

`purchaseAuthorized: false`. `readyForRelease: false`. No deployment,
payment, live SDS price change, new account/chain/queue, or secrets.
