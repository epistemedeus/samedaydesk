# Unpaid SameDayDesk commerce receipt fixtures

Typed unpaid-only commerce receipts for `agents.samedaydesk.com`. HTTP 402
and an unpaid buyer stop are not settlement. A paid body, payment header,
`charged: true`, or transaction labeled unpaid is `paid_as_unpaid`.

This is a fixture pack and validator. It does not pay, checkout, publish,
or mutate a registry.

```
node tools/commerce-receipts/cli.mjs --suite
node tools/commerce-receipts/cli.mjs --seeded-failure paid-as-unpaid
node tools/commerce-receipts/cli.mjs --expect-reject paid_as_unpaid fixtures/commerce-receipts/invalid/paid-as-unpaid.json
node tools/commerce-receipts/cli.mjs fixtures/commerce-receipts/valid/unpaid-402-extract.json
node --test tools/commerce-receipts/test.mjs
```

`--live`, `--pay`, `--checkout`, `--publish`, `--registry`, `--refresh`, and
`--settle` are refused (exit 2).

## Unpaid-only

Valid fixtures live in `fixtures/commerce-receipts/valid/`. Each record has
`statusClass: unpaid`, `charged: false`, `paymentSent: false`, and no
settlement object. Challenge kinds are HTTP 402. Buyer-runtime stop has
`httpStatus: null` because no paid retry ran.

Naive verdict is `statusClass === "unpaid"` → accept. Honest verdict scans
paid evidence. The designated seed is naive-accept / honest-reject.

## Seeded failure

`fixtures/commerce-receipts/invalid/paid-as-unpaid.json` copies an unpaid
extract 402 then attaches the in-tree facilitator settlement
`0x2916cfe2…` (`agent402-external-validation-purchase-2026-08-29`).

```
node tools/commerce-receipts/cli.mjs --seeded-failure paid-as-unpaid
```

Exit 1, `error.code` `SEED_REJECT`, `codes` includes `paid_as_unpaid`.

## Record fields

JSON Schema: `schema/commerce-receipt.v1.json`. Catalog:
`fixtures/commerce-receipts/catalog.json`.

| Field | Rule |
| --- | --- |
| `statusClass` | `unpaid` only in this pack |
| `charged` / `paymentSent` | must be false |
| `httpStatus` | `402` for challenge kinds; `null` for `unpaid_buyer_stop` |
| `accepts` | exact Base USDC to the SDS pin `payTo` |
| `offerReceipt.offers` | unsigned offer identity; not settlement |
| `offerReceipt.receipt` | if present → `paid_as_unpaid` |
| `settlement` | if present → `paid_as_unpaid` |
| `joinKeys` | `receipt_id`, `resource`, `amount`, `pay_to` (declared, not joined here) |

Required prohibited inferences: `paid_as_unpaid`, `offer_is_settlement`,
`http_402_is_delivery`, `payment_header_is_unpaid`.

Offer signatures and `validUntil` are omitted as volatile. Empty 402 JSON
bodies are still unpaid challenges, not delivery.
