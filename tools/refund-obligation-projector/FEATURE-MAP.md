# Feature map — W5-D22 Co07 refund-policy projector

SDS-local read-only projector. Not Stripe refunds. Not TaskMarket refunds.
Not I01 earned-work payout. 8.105 USDC is historical and is not a job field.

| Field | Value |
| --- | --- |
| User goal | Project `refundClaim` `none`, `unknown`, or `not-offered` from an explicit policy document plus actual job facts. Operational delivery errors stay facts. They do not invent policy. |
| Entrypoint | `tools/refund-obligation-projector/` (`bin/project.mjs`, `lib/contract.mjs`) |
| Command | `node tools/refund-obligation-projector/bin/project.mjs --pretty` |
| Dossier | `--operation-id <id>` or `GET /projection?operationId=` |
| Policy | `--policy fixtures/policy/<file>.json` |
| Local HTTP | `node tools/refund-obligation-projector/bin/project.mjs --listen --host 127.0.0.1 --port 0` then `GET /projection` |
| State | `refundClaim: none \| unknown \| not-offered`; `refundClaimSource: explicit_policy \| no_policy \| no_matching_rule`; `paidOut: false`; `citedBankedUsdcAttached: false` |
| Tests | `cd tools/refund-obligation-projector && npm test` |
| Account prerequisite | None for fixture + local HTTP. Local Postgres tests need `initdb`/`pg_ctl`/`psql` (PostgreSQL 16 at `/usr/lib/postgresql/16/bin`). No Stripe, wallet, or live refund account. |

## Contract

`lib/contract.mjs` is the published export. `none` and `not-offered` require an explicit `samedaydesk.refund-policy.v1` document. Matching is exact field equality. Delivery substring inference is not used.

Job facts come from evidence-record settlements. Optional overlays are the W4 D13 ledger pin `aa306e291adfdd499ca971af01625ccc4bfee5c4` (`samedaydesk.buyer-value-ledger.v1`) and PR52 receipt `aeef964fa188443078958d9d6d393afae1d542ee` (`samedaydesk.paid-useful-jobs.receipt.v1`). This package does not copy those kernels. Wave5 D13 / D01 may amend them.

`outcomeKind` is a job-fact label: `analysis` (including a valid engine refusal), `operational_error`, `engine_failure`, `transport_failure`, or `unknown`. It is not a refund policy. HTTP 500 `projector_transport_error` is not a refund claim.

## Caller journey

Project the five published `tools/evidence-records/fixtures/settlements/*.json` records with no policy file.

agent402 keeps delivery
`seller_http_200_repair_required_no_buyer_owned_output_enforcement`, outcomeKind
`operational_error`, and `refundClaim` `unknown`. A dossier for that operation does
not contain 8.105. Buyer-attested What Agents Buy stays `unknown` until
`fixtures/policy/attested-delivery-none.json` is supplied. No row is paid-out.

## Evidence kinds

| Kind | What it proves |
| --- | --- |
| fixture | Published settlement JSON plus seeded rejects and explicit policy files |
| local-runtime | `node:http` on 127.0.0.1 and disposable Postgres 16 |
| external | Stripe refunds / live TaskMarket / I01 HTTP: not executed |

## Later integration (W5-D01)

| Binding | Status |
| --- | --- |
| evidence-records | Imported from this SDS checkout |
| D13 buyer-value ledger | Adapter pin `aa306e291adfdd499ca971af01625ccc4bfee5c4`. Ledger kernel not copied. |
| PR52 wrapper | Receipt `engineResult` only. Wrapper not copied. |
| I01 Neo PR54 `hashTermsVersion` | Adapter pin only (`sha256:` + 64 hex). `hashTermsVersion` is null until Root injects `packs/funded-task-terms`. Integer termsVersion refused. Unlike hashes are not equal. |
| Stripe refunds | Refused (`--execute-refund`) |
| Obligation payout | Refused (`--post-paid`) |
| Cited banked 8.105 | Refused (`--attach-cited-banked`) |

## Seeded refusals

Organic label on `incentivized_trial`; summing independent+owner as revenue;
`--execute-refund`; integer `termsVersion`; `--attach-cited-banked`; D13 ledger
that treats 8.105 as job revenue.
