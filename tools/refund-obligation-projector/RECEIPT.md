# W5-D22 RECEIPT — Co07 refund-policy projector

**Date:** 11 September 2026
**Branch:** `cursor/w5-d22-co07-refund-policy-projection-from-explicit-policy-and-actual-job-facts-8a04`
**Base:** `f19a021a82a4ff59fd3b510fda11e603e6885686`
**Owned paths:** `tools/refund-obligation-projector/`, `experiments/wave5/d22/RECEIPT.md`
**Integration owner:** W5-D01

## What

Read-only projector. `refundClaim` is `none | unknown | not-offered`.
`none` and `not-offered` require an explicit `samedaydesk.refund-policy.v1`
document. Operational delivery status is preserved as a job fact
(`outcomeKind`). It does not invent policy. Customer dossiers omit the
banked 8.105 USDC observation.

Never calls Stripe refunds. Never posts obligations as paid.

## Commands

```sh
node tools/refund-obligation-projector/bin/project.mjs --pretty
cd tools/refund-obligation-projector && npm test
```

Node 22.14.0. No extra npm packages. Local Postgres tests use
`/usr/lib/postgresql/16/bin` (`initdb`, `pg_ctl`) and `/usr/bin/psql`.
HTTP tests bind `127.0.0.1`. Missing Postgres is a failed gate, not a skip.

## Journey (fixture)

Five published settlement rows with no policy file. agent402 keeps
`seller_http_200_repair_required_no_buyer_owned_output_enforcement`,
`outcomeKind: operational_error`, and `refundClaim: unknown`.
`paidOut` is false on every row. `citedBankedUsdcAttached` is false.
The dossier for agent402 does not contain 8.105.

## Seeded failures

| Input | Code |
| --- | --- |
| `fixtures/seeded/organic-incentivized-trial.json` | `organic_label_for_controlled_or_incentivized_traffic` |
| `--sum-as-revenue` / `asRevenue()` | `sum_across_buyer_class_as_revenue` |
| `--execute-refund` | `execute_refund_refused` |
| `--terms-version 1` / integer policy terms | `integer_terms_version` |
| `--post-paid` | `post_paid_refused` |
| `--attach-cited-banked` | `cited_banked_usdc_is_not_job_revenue` |
| D13 ledger `jobRevenueUsdc: "8.105"` | `cited_banked_usdc_is_not_job_revenue` |
| HTTP `POST /refund` | `execute_refund_refused` |
| HTTP unexpected throw | `projector_transport_error` (500) |
| Postgres `UPDATE ... paid_out = true` | `never_paid_out` |

## Tests

**PASS.** 31 tests, 0 fail, 0 skipped (`cd tools/refund-obligation-projector && npm test`).

| Kind | Covered |
| --- | --- |
| fixture | published settlements, explicit policy files, D13 pin ledger, PR52 receipt fields |
| local-runtime | CLI `--listen` + `GET /projection` dossier; disposable Postgres 16 (required) |
| external | not executed (Stripe, TaskMarket, I01 HTTP, live refunds) |

## Untested

Live Stripe refunds, TaskMarket refund flows, I01 earned-work HTTP/Postgres
service, injecting Neo `hashTermsVersion` as a real import, Wave5 D13
amended ledger (tested W4 pin only), and any production deploy.

## Hard stops

No deploy, purchase, live payment, account change, or customer messages.
Homepages, `server/pricing.js`, F08/W2/W3/H, and root `package.json` untouched.
