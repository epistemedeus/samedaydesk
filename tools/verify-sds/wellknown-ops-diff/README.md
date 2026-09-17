# SDS well-known ops vs bazaar-tracker diff

Offline verifier. Compares SameDayDesk `/.well-known/x402.json` operations
(committed presence catalog) to the SDS seller rows in
`data/bazaar-tracker/observations.json`.

This pack does not fetch CDP, does not call `agents.samedaydesk.com`, and does
not send `PAYMENT-SIGNATURE`, `X-PAYMENT`, or Stripe. `--live` is refused.

Catalog absence is not buyer demand. A well-known route missing from the
tracker is a listing-coverage gap, not evidence that buyers want that route.

## Write boundary

`tools/verify-sds/wellknown-ops-diff/**` only.

## Cold artifacts

| Input | Path | Role |
|---|---|---|
| Well-known catalog | `fixtures/presence/catalog/x402.json` | Origin `/.well-known/x402.json` v2, 23 items |
| Tracker | `data/bazaar-tracker/observations.json` | Compact SDS seller, 8 routes |

Compact projections (method+path / digest only, no payment terms) live under
`fixtures/` in this pack for replay.

Committed pin: **23 well-known ops vs 8 tracker SDS paths**. The eight tracker
paths are a subset of well-known. Well-known-only includes
`GET /commerce/settlement-proof` and `POST /security/wallet-policy-conformance`.

## CLI

```
node tools/verify-sds/wellknown-ops-diff/cli.mjs
node tools/verify-sds/wellknown-ops-diff/cli.mjs diff --json
node tools/verify-sds/wellknown-ops-diff/cli.mjs run
node tools/verify-sds/wellknown-ops-diff/cli.mjs --seeded-failure claim-match
node tools/verify-sds/wellknown-ops-diff/cli.mjs --seeded-failure absence-as-demand
node tools/verify-sds/wellknown-ops-diff/cli.mjs --seeded-failure ghost-tracker
node tools/verify-sds/wellknown-ops-diff/cli.mjs --seeded-failure live
node tools/verify-sds/wellknown-ops-diff/cli.mjs --seeded-failure payment-signature
```

`--live` exits 2 (`LIVE_REFUSE`). Seeded claim/demand/ghost exits 1. Cold diff
exits 0 when the committed 8-vs-23 gap is reported honestly.

## Seeded failures

| Seed | Code | Meaning |
|---|---|---|
| `claim-match` | `CLAIM_ALIGNED` | Rejects the lie that well-known and tracker match |
| `absence-as-demand` | `ABSENCE_IS_NOT_DEMAND` | Rejects treating a well-known-only path as buyer demand |
| `ghost-tracker` | `GHOST_TRACKER_ROUTE` | Rejects a tracker route that is not in well-known |
| `live` | `LIVE_REFUSE` | Refuses `--live` / CDP / origin fetch |
| `payment-signature` | `PAYMENT_HEADER_REFUSE` | Refuses sending `PAYMENT-SIGNATURE` |

## Cite

- Presence catalog capture: `fixtures/presence/catalog/x402.json`
- Bazaar tracker SDS seller: `data/bazaar-tracker/observations.json`
- Related (out of this write boundary): PR 186 `tools/bazaar-tracker` 8-vs-26 evidence ops
