# Unpaid SameDayDesk commerce receipt fixtures

Typed unpaid-only commerce receipts for `agents.samedaydesk.com`. HTTP 402
and an unpaid buyer stop are not settlement. A paid body, payment header,
`charged: true`, or transaction labeled unpaid is `paid_as_unpaid`.

This is a fixture pack and validator. It does not pay, checkout, publish,
attach neo-kernel-vendor, or mutate a registry. Write boundary:
`tools/commerce-receipts/**`.

```
node tools/commerce-receipts/cli.mjs --cold
node tools/commerce-receipts/cli.mjs --seeded-failure paid-as-unpaid
node tools/commerce-receipts/cli.mjs --expect-reject paid_as_unpaid tools/commerce-receipts/fixtures/invalid/paid-as-unpaid.json
node tools/commerce-receipts/cli.mjs tools/commerce-receipts/fixtures/valid/unpaid-402-extract.json
node --test tools/commerce-receipts/test.mjs
```

`--live`, `--pay`, `--payment`, `--checkout`, `--publish`, `--registry`,
`--refresh`, `--settle`, `--neo`, and `--neo-kernel-vendor` are refused
(exit 2), including `--flag=value` forms. Unknown flags, missing
`--seeded-failure` values, mixed `--cold`/`--seeded-failure` args, and a
missing command are JSON `USAGE` (exit 2).

## Unpaid-only

Valid fixtures live in `tools/commerce-receipts/fixtures/valid/`. Each
record has `statusClass: unpaid`, `charged: false`, `paymentSent: false`,
and no settlement object. Challenge kinds are HTTP 402. Buyer-runtime stop
has `httpStatus: null` because no paid retry ran.

Naive verdict is `statusClass === "unpaid"` → accept. Honest verdict scans
paid evidence. The designated seed is naive-accept / honest-reject.

## Seeded failure

`tools/commerce-receipts/fixtures/invalid/paid-as-unpaid.json` copies an
unpaid extract 402 then attaches the in-tree facilitator settlement
`0x2916cfe2…` (`agent402-external-validation-purchase-2026-08-29`).

```
node tools/commerce-receipts/cli.mjs --seeded-failure paid-as-unpaid
```

Exit 1, `error.code` `SEED_REJECT`, `codes` includes `paid_as_unpaid`.
If the seed is not caught (`SEED_ACCEPTED` / `SEED_MISS`), exit 2.

## Record fields

JSON Schema: `schema/commerce-receipt.v1.json`. Catalog:
`tools/commerce-receipts/fixtures/catalog.json`.

| Field | Rule |
| --- | --- |
| `statusClass` | `unpaid` only in this pack |
| `charged` / `paymentSent` | must be false |
| `httpStatus` | `402` for challenge kinds; `null` for `unpaid_buyer_stop` |
| `accepts` | exact Base USDC to the SDS pin `payTo` |
| `resource` / `route` / `request.url` | pathname equals `route`; `request.url` equals `resource`; catalog-sourced extract/gateway records use the in-tree x402 example URL string |
| `offerReceipt.offers` | unsigned offer identity; payload scheme/network/asset/payTo/amount/resourceUrl must match accept + resource; not settlement |
| `offerReceipt.receipt` | if present → `paid_as_unpaid` |
| `settlement` | if present → `paid_as_unpaid` |
| `joinKeys` | `receipt_id`, `resource`, `amount`, `pay_to` (declared, not joined here) |

Required prohibited inferences: `paid_as_unpaid`, `offer_is_settlement`,
`http_402_is_delivery`, `payment_header_is_unpaid`.

Offer signatures and `validUntil` are omitted as volatile. Empty 402 JSON
bodies are still unpaid challenges, not delivery.
