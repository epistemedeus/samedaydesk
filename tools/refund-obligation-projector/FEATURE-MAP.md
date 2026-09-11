# Feature map — W4-commerce-07 refund and obligation projector

SDS-local read-only projector. Not Stripe refunds. Not TaskMarket refunds.
Not I01 earned-work payout. 8.105 USDC is historical, not spendable.

| Field | Value |
| --- | --- |
| User goal | From published settlement evidence, project per-operation refundClaim `none`, `unknown`, or `not-offered`. Preserve delivery status. Never mark a row paid-out or payable. |
| Entrypoint | `tools/refund-obligation-projector/` (`bin/project.mjs`, `lib/project.mjs`) |
| Command | `node tools/refund-obligation-projector/bin/project.mjs --pretty --out tools/refund-obligation-projector/fixtures/golden/projection.json` |
| Local HTTP | `node tools/refund-obligation-projector/bin/project.mjs --listen --host 127.0.0.1 --port 0` then `GET /projection` |
| State | `refundClaim: none \| unknown \| not-offered`; `paidOut: false`; `citedBankedSpendable: false`; `revenueAcrossBuyerClass: null`; `payableAsserted: false` |
| Tests | `cd tools/refund-obligation-projector && npm test` |
| Account prerequisite | None for fixture + local HTTP. Local Postgres tests need `initdb`/`pg_ctl`/`psql` (this receipt used PostgreSQL 16 at `/usr/lib/postgresql/16/bin`). No Stripe, wallet, or live refund account. |

## Caller journey

Project the five published `tools/evidence-records/fixtures/settlements/*.json` records.

agent402 (`0.010`, buyerClass `unknown`) keeps delivery
`seller_http_200_repair_required_no_buyer_owned_output_enforcement` and is
`not-offered`. Buyer-attested What Agents Buy and the GoFrantic payout are
`none`. Seller-only payapi and early x402 rows are `unknown`. No row is paid-out.

## Evidence kinds

| Kind | What it proves |
| --- | --- |
| fixture | Published settlement JSON plus seeded rejects |
| local-runtime | `node:http` on 127.0.0.1 and disposable Postgres 16 |
| external | Stripe refunds / live TaskMarket / I01 HTTP: not executed |

## Later integration (Root)

| Binding | Status |
| --- | --- |
| evidence-records + reconcile | Imported from SDS main `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| I01 Neo PR54 `hashTermsVersion` | Adapter pin only (`sha256:` + 64 hex). `hashTermsVersion` is null until Root injects `packs/funded-task-terms`. Integer termsVersion refused. Original F01 kernel not copied. |
| Stripe refunds | Refused (`--execute-refund`) |
| Obligation payout | Refused (`--post-paid`) |

## Seeded refusals

Organic label on `incentivized_trial`; summing independent+owner as revenue;
`--execute-refund`; integer `termsVersion`.
