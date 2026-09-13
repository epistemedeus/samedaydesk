# W4-commerce-07 RECEIPT — refund and obligation projector

**Date:** 11 September 2026
**Branch:** `codex/w4-commerce-07-20260911`
**HEAD:** `6d57566822c3e416910d121caee76cd825021027`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
**Owned path:** `tools/refund-obligation-projector/`
**Integration owner:** Root

## What

Read-only projector from published evidence-record settlement fixtures.
Output is `projection.json` with per-record
`{operationId, amountUsdc, buyerClass, delivery, refundClaim}` where
`refundClaim` is `none | unknown | not-offered`. Never calls Stripe refunds.
Never posts obligations as paid. 8.105 USDC is cited and not spendable.

Pinned agent402 delivery on current SDS main is
`seller_http_200_repair_required_no_buyer_owned_output_enforcement`, not a
stale `repair_required` enum. I01 Neo PR54
(`819fa637ecf5e5177c84efc16fcaa18d57017631`) owns earned-work
content-hash `termsVersion`. This pack injects that kind check and does not
copy the F01 kernel.

## Commands

```sh
node tools/refund-obligation-projector/bin/project.mjs --pretty
cd tools/refund-obligation-projector && npm test
```

Node 22.14.0. No extra npm packages. Local Postgres tests use
`/usr/lib/postgresql/16/bin` (`initdb`, `pg_ctl`) and `/usr/bin/psql`.
HTTP tests bind `127.0.0.1`.

## Journey (fixture)

Five published settlement rows. agent402 is `not-offered` with
`repair_required` preserved in `delivery`. `paidOut` is false on every row.
`citedBankedUsdc` is `8.105` with `citedBankedSpendable: false`.
`revenueAcrossBuyerClass` is null.

## Seeded failures

| Input | Code |
| --- | --- |
| `fixtures/seeded/organic-incentivized-trial.json` | `organic_label_for_controlled_or_incentivized_traffic` |
| `--sum-as-revenue` / `asRevenue()` | `sum_across_buyer_class_as_revenue` |
| `--execute-refund` | `execute_refund_refused` |
| `--terms-version 1` | `integer_terms_version` |
| `--post-paid` | `post_paid_refused` |
| HTTP `POST /refund` | `execute_refund_refused` |
| Postgres `UPDATE ... paid_out = true` | `never_paid_out` |

## Tests

**PASS** — 18 tests, 0 fail, 0 skipped (`node --test --test-concurrency=1 test/*.test.mjs`).

| Kind | Covered |
| --- | --- |
| fixture | published settlements + seeded JSON |
| local-runtime | CLI `--listen` + `GET /projection`; disposable Postgres 16 |
| external | not executed (Stripe, TaskMarket, I01 HTTP, live refunds) |

## Untested

Live Stripe refunds, TaskMarket refund flows, I01 earned-work HTTP/Postgres
service, injecting Neo `hashTermsVersion` as a real import (adapter pin only),
and any production deploy.

## Hard stops

No deploy, purchase, live payment, account change, or customer messages.
Homepages, `server/pricing.js`, F08/W2/W3/H, and root `package.json` untouched.
