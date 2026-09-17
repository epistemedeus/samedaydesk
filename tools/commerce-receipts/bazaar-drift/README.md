# SDS bazaar-listing vs unpaid commerce-receipt drift

Offline join of Coinbase Bazaar SameDayDesk listings to unpaid origin 402
commerce receipts. HTTP 402 is not settlement. Catalog absence is not
demand. Compact observations stay digest-only.

This pack does not pay, checkout, publish, call CDP, attach
neo-kernel-vendor, or rewrite live prices. Write boundary:
`tools/commerce-receipts/bazaar-drift/**`.

```
node tools/commerce-receipts/bazaar-drift/cli.mjs --cold
node tools/commerce-receipts/bazaar-drift/cli.mjs --seeded-failure read-claimed-match
node tools/commerce-receipts/bazaar-drift/cli.mjs --expect-reject amount_drift tools/commerce-receipts/bazaar-drift/fixtures/invalid/read-claimed-match.json
node tools/commerce-receipts/bazaar-drift/cli.mjs tools/commerce-receipts/bazaar-drift/fixtures/valid/extract-aligned.json
node --test tools/commerce-receipts/bazaar-drift/test.mjs
```

`--live`, `--pay`, `--payment`, `--checkout`, `--publish`, `--registry`,
`--refresh`, `--settle`, `--neo`, and `--neo-kernel-vendor` are refused
(exit 2).

## Cold run

`--cold` joins the pinned eight SDS Bazaar routes to unpaid origin 402
amounts taken from `fixtures/presence/catalog/x402.json`.

| Path | Bazaar atomic | Receipt atomic |
| --- | ---: | ---: |
| `/extract` and six other listed routes | match origin | match origin |
| `/read` | `50000` | `5000` |
| `/commerce/settlement-proof` | absent | `5000` |

The `/read` row is the documented Agent402 `priceConflict` (bazaar 0.05 vs
origin/OpenAPI 0.005). Cold exit 0 means the audit still reports that HOLD
and does not treat bazaar-absent origin routes as buyer demand.

Naive verdict is same-path plus `statusClass: unpaid` → match. Honest
verdict compares atomic integer-string amounts.

## Seeded failure

`fixtures/invalid/read-claimed-match.json` copies the `/read` pair and
claims `match: true`. Naive accept. Honest reject `amount_drift`.

```
node tools/commerce-receipts/bazaar-drift/cli.mjs --seeded-failure read-claimed-match
```

Exit 1, `error.code` `SEED_REJECT`, `codes` includes `amount_drift`.

## Compact observations

Full listing snapshots may carry `accepts` for the amount compare. The
compact projection emitted by `--cold` is `{ route, seller, sellerId,
source, digest }` only. A compact object that stores `payTo` or `amount`
is `payto_in_compact` / `payment_terms_in_compact`.
