# SDS bazaar-drift commerce receipt

Offline comparator for Coinbase Bazaar SameDayDesk listings versus the
recorded origin catalog. It reports drift. It does not rematerialize a
Bazaar row, rewrite origin prices, pay, publish, or call CDP.

Write boundary: `tools/commerce-receipts/bazaar-drift/**`.

## Recorded conflict

Committed evidence still disagrees on `GET /read`:

| Surface | Amount | Atomic (USDC, 6 decimals) |
| --- | --- | --- |
| SDS origin OpenAPI 1.23.40 / unpaid 402 | `0.005` | `5000` |
| Bazaar merchant listing | `0.05` | `50000` |

Agent402's seller snapshot records `priceConflict: true` on that route.
The other seven Bazaar SDS routes match origin amounts. Catalog absence
(17 live origin ops not in the eight Bazaar rows) is not buyer demand.
`quality.lastCalledAt` is not a removal clock.

## Cold run

Pins are copied from committed repo files and cross-checked on every run:

- `docs/lqdist1-distribution-audit/per-route-table.json` (25 paid ops)
- `fixtures/presence/listings/bazaar-merchant.json` (8 SDS-host listings)
- `data/bazaar-tracker/observations.json` (SDS `rowCount` 8)
- `docs/lqdist1-distribution-audit/evidence/agent402-seller-bounded.json`

```
node tools/commerce-receipts/bazaar-drift/cli.mjs --cold --pretty
node tools/commerce-receipts/bazaar-drift/cli.mjs --from-repo --pretty
```

Exit 0. `ok: true`, `decision: hold`, `code: bazaar_price_conflict`,
`rematerialized: false`, `liveSdsPricesUnchanged: true`, `paid: false`.
The receipt keeps origin `/read` at `0.005`.

## Seeded failure

`fixtures/reject/rematerialized-read.json` claims the stale Bazaar `/read`
row was rematerialized to `0.005`. Naive verdict accepts
`claims.rematerialized`. Honest verdict rejects: the committed listing is
still `50000`.

```
node tools/commerce-receipts/bazaar-drift/cli.mjs --seeded-failure rematerialized-read --pretty
node tools/commerce-receipts/bazaar-drift/cli.mjs --seeded-failure read-claimed-match --pretty
```

Exit 1, `error.code` `SEED_REJECT`, `codes` includes `rematerialized_claim`.
A missed or accepted seed exits 2. Bazaar pin resources must be the SDS host.

Other refusals under `fixtures/reject/`:

| Fixture | Code |
| --- | --- |
| `rewrite-origin.json` | `edit_live_prices` |
| `absence-as-demand.json` | `treat_absence_as_demand` |
| `lastCalledAt-removal.json` | `last_called_at_is_not_a_clock` |
| `paid-as-unpaid.json` | `paid_as_unpaid` |
| `float-money.json` | `float_money` |
| `purchase-authority.json` | `purchase_authority` |

`--live`, `--pay`, `--checkout`, `--publish`, `--rematerialize`,
`--settle`, `--neo`, and `--neo-kernel-vendor` exit 2.

```
node --test tools/commerce-receipts/bazaar-drift/test.mjs
node tools/commerce-receipts/bazaar-drift/cli.mjs --suite
```
