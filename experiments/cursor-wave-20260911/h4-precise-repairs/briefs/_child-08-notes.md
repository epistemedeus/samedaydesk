# Child 08 — notes: F18-routes, M-H4-api, M-F16-meter

Pack: `experiments/cursor-wave-20260911/h4-precise-repairs/`
Branch: `fable/h4r-defect-corpus`
Parent session: `512803b8-c0dc-4a9d-a58f-1ab2d07cc0a3`
Prior H4 session: `1434eeed-5e5c-48d1-b2d1-1ea29c966400`

Observation only. Did not edit `client/public/x402/verified.json`, `server/`, `FEATURE-MAP.md`, `RECEIPT.md`, `src/cli.ts`, `src/intake.ts`, `src/failures.ts`, or `src/corpus-types.ts`. Did not implement an F16 meter.

## Quoted local feed (`client/public/x402/verified.json`)

Source keys: `schemaVersion`, `generatedAt`, `limitations`, `routes`.

```
schemaVersion: samedaydesk.x402-verified-feed.v1
generatedAt:   2026-09-07T18:50:05.000Z
routes.length: 20
```

`routes.length` counted from the committed JSON array (not from live F18). Paths:

```
GET /extract
GET /read
GET /scan
GET /schemaforge
GET /enrich
GET /wallet-enrich
GET /deep-audit
GET /defi/morpho-position
GET /defi/morpho-protection
GET /defi/morpho-market-underwrite
GET /defi/morpho-preliquidation-replay
GET /work/opportunity-preflight
GET /distribution/agent-discoverability-audit
GET /commerce/payment-offer-preflight
GET /commerce/settlement-proof
GET /chain/transaction-receipt
GET /chain/solana-transaction-receipt
GET /commerce/seller-integrity-audit
GET /commerce/contract-qualified-search
GET /distribution/agent-surface-budget-audit
```

`src/corpus-notes.ts` `readLocalRouteCount()` returns that `routes.length` (20).

## F18-routes

Vendor/MONITOR observation: live `routeCount` **23** vs older **22**. Action: observation only.

This tree’s committed feed is **20**, not 23 and not 22. Three facts recorded together:

| Fact | Value |
| --- | --- |
| `facts.f18LiveRouteCount` | 23 |
| `facts.olderRouteCount` | 22 |
| `facts.localRouteCount` | 20 (`verified.json` `routes.length`) |

Disposition: `noted`. Kind: `note`. Evaluator: `corpus-notes`. No production route change. `verified.json` left untouched.

## M-H4-api

Short API result vs delivered branch. This run’s collector must obtain a real **non-truncated** Heavy receipt.

This child **cannot** write parent `RECEIPT.md`. The deliverable is:

1. Parent `RECEIPT.md` **H4R** section
2. Parent **final JSON stdout** (pretty, non-truncated)

Session pins to carry on that receipt:

- Prior H4: `1434eeed-5e5c-48d1-b2d1-1ea29c966400`
- Parent H4R: `512803b8-c0dc-4a9d-a58f-1ab2d07cc0a3`

Disposition: `noted`. Fixture: `fixtures/corpus/M-H4-api.json`.

## M-F16-meter

F16 meter vendored; Pilot is not attached to SDS; SDS cannot push Pilot. Repo search found no F16 meter product on this tree (`vendor/` is correspondence only). Brief: `briefs/M-F16-meter.md`. No meter implemented. Disposition: `noted`.
