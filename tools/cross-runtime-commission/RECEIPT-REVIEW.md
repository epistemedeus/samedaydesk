# RECEIPT-REVIEW — Wave 3 SDS reserve tools (one repo)

**Date:** 11 September 2026  
**Reviewer:** Cursor Cloud on `epistemedeus/samedaydesk`  
**Start branch:** `fable/w3-09-e03-cross-runtime-commission`  
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`  
**Node:** v22.14.0  
**Not done:** merge, deploy, payment, F08 rewrite. Banked 8.105 USDC was not spent.

Fetched assignment pins first. All six matched. Honesty fixes were then committed on each owning `fable/*` branch. Tips below are those **newer** heads.

## Heads (pin → reviewed tip)

| ID | Branch | Pin | Reviewed tip | PR | Own path |
| --- | --- | --- | --- | --- | --- |
| W3-09 | `fable/w3-09-e03-cross-runtime-commission` | `2ef5556a6c76c3bc0633e8595df3c165fa5aa281` | `5722a4df34161446f566e44e6c4353caefdb904e` | [sds#55](https://github.com/epistemedeus/samedaydesk/pull/55) draft | `tools/cross-runtime-commission/` |
| W3-10 | `fable/w3-10-e06-pre-spend-assurance` | `779ae0ef6c44b75229f8c6ad8415d86647f2669e` | `1322369574142a78d536b3be2e18660f7acc083d` | [sds#57](https://github.com/epistemedeus/samedaydesk/pull/57) draft | `tools/pre-spend-cost-assurance/` |
| W3-11 | `fable/w3-11-f05-managed-listing-repair` | `1f27456ac3fb6e5597975ca6cf3bcf1501a946b5` | `3a278a74cb23c57617c608997dc08876925b105d` | [sds#56](https://github.com/epistemedeus/samedaydesk/pull/56) draft | `tools/managed-listing-repair/` |
| W3-12 | `fable/w3-12-g02-hook-regression` | `202b202d4b323556f15c49d50982693c36987740` | `0480e47d0372a2297c29f36c0a4829b72a3ab2a0` | [sds#73](https://github.com/epistemedeus/samedaydesk/pull/73) draft (opened this review) | `tools/hook-regression/` |
| W3-13 | `fable/w3-13-h02-vendor-price-feed` | `a004e61e5078631c78a892a3adeac81f1d695ea6` | `3fff654562fb64b763757e2e735710d39108dd3a` | [sds#53](https://github.com/epistemedeus/samedaydesk/pull/53) draft | `tools/vendor-price-feed/` |
| W3-14 | `fable/w3-14-h03-public-data-corrections` | `d2565f4fcd99f45b32762f672345ae97c97780e4` | `23633a7de0c6dae3b576bea9f5a793c0eeef6fa9` | [sds#54](https://github.com/epistemedeus/samedaydesk/pull/54) draft | `tools/public-data-corrections/` |

No `cursor/*` leftover heads. Diffs vs `main` stay in each own path plus a root `test:*` script (W3-11 also adds `tools/managed-listing-repair/out/` to `.gitignore`). `server/paid-useful-jobs/` is absent on every branch. Live price files vs `main`: empty.

## Commands / evidence

Re-ran each documented journey and seeded CLI on the reviewed tip. All journeys exit 0. Seeded refusals exit non-zero with the documented code. `purchaseAuthorized` is false wherever the report emits it. `sold` is false. F08 wrappers were not rewritten.

| ID | Journey | Tests | Journey honesty | Seeded codes |
| --- | --- | --- | --- | --- |
| W3-09 | `cd tools/cross-runtime-commission && node bin/cross-runtime.mjs journey --fixture fixtures/ok.json` | `npm run test:cross-runtime-commission` **14/14** | `ok`; two labelled runtimes; `independent:true`; `purchaseAuthorized:false`; `sold:false`; `liveExtract.usdc=0.005`; `liveSellerIntegrityAudit.usdc=0.01`; `engine.purchaseAuthority:false` | `one-runtime-not-independent`; `sample-not-commissioned-customer-work`; `extract-price-immutable`; `invented-paying-maintainer`; `f08-wrappers-out-of-scope` |
| W3-10 | `cd tools/pre-spend-cost-assurance && node bin/pre-spend.mjs journey --fixture fixtures/ok.json` | `node --test --test-concurrency=1 tests/*.test.mjs` **19/19** | `costCap=0.015`; `purchaseAuthorized:false`; `settleCalled:false`; POST-payment plan `post_payment` | `default_purchase`; `wrong_units`; `http_402_as_success`; `sample_as_paid_assurance`; `edit_live_prices`; `post_payment`; `invalid_delivery_spend`; CLI `settle_refused` / `prepare_refused` |
| W3-11 | `cd tools/managed-listing-repair && node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json` | `npm run test:managed-listing-repair` **16/16** | one-field suggestion; `publishAuthorized:false`; `purchaseAuthorized:false`; `sold:false`; SAMPLE accepted-correction rejected | `auto_publish_rejected`; `sample_accepted_correction_rejected`; `noop_sold_as_fix_rejected`; `f08_edit_rejected`; `live_price_mutation_rejected` |
| W3-12 | `cd tools/hook-regression && node bin/hook-regression.mjs journey --fixture fixtures/ok-payload.json` | `npm test` **15/15** | `missing_hint` + `signed:false`; authority unchanged; `purchaseAuthorized:false`; `sold:false`; `installLiveHooks:false`; live `$0.005` / `$0.01`; `h4Imported:false` (H4 tree not on this checkout) | `unsigned-hint-is-not-authority`; `rewrite-payload-to-fix-discovery`; `install-live-resource-server-hooks`; `change-live-prices`; `edit-h4-directory` |
| W3-13 | `cd tools/vendor-price-feed && node bin/vendor-price-feed.mjs journey --fixture fixtures/ok.json` | `npm test` **12/12** | ingest → current → older `stale`; SAMPLE `sample-not-upstream`; `purchaseAuthorized:false`; `liveCatalogWritten:false` | `missing-source-url`; `invalid-unit`; `amount-not-decimal`; `sample-not-upstream`; `history-overwrite`; `live-sds-price-mutation` |
| W3-14 | `cd tools/public-data-corrections && node bin/public-data-corrections.mjs journey --fixture fixtures/ok.json` | `node --test` **19/19** | `rights:cleared`; `publishAuthorized:false`; `purchaseAuthorized:false`; private email/address rejected; stdout does not echo PII | `private-data`; `unknown-rights-labelled-cleared`; `sample-as-customer-owned`; `auto-publish`; `invented-paying-rights-holder`; `unknown-rights-cannot-publish` |

Mcp.tsx named-tool slices: extract `$0.005`, `seller_integrity_audit` `$0.01`. Catalog/OpenAPI/verified feed still list atomic `5000` / `10000`.

## Defects fixed (owning branch + regression test)

| Branch | Defect | Fix |
| --- | --- | --- |
| W3-09 | Journey JSON named `purchaseAuthority` only; seller-integrity-audit pin not on the report; Mcp `$0.005` unscoped (also matches `read`) | Emit `purchaseAuthorized:false` and `liveSellerIntegrityAudit` (`0.01` / `$0.01`); bind Mcp prices to named tools |
| W3-10 | Mcp `$0.005` / `$0.01` matched any neighbor (`read`, `contract_qualified_search`) | Slice from `name: "extract"` and `name: "seller_integrity_audit"` |
| W3-11 | Documented CLI compact dropped `purchaseAuthorized` / `purchaseAuthority` | Compact journey emits both `false`; Mcp slices; SAMPLE/auto-publish tests assert `sold:false` |
| W3-12 | Journey omitted sale/price honesty; draft PR missing | Journey records `purchaseAuthorized:false`, live `$0.005`/`$0.01`, `installLiveHooks:false`; opened draft [sds#73](https://github.com/epistemedeus/samedaydesk/pull/73) |
| W3-13 | Results had `purchaseAuthority` only | `purchaseAuthorized:false` on refuse/ok/ingest/journey |
| W3-14 | `reject()` spread `extra` after `publishAuthorized:false`, so a packet could overwrite it | Pin `publishAuthorized` and `purchaseAuthorized` **after** `...extra` |

## Verdict

**ready** — six journeys and seeded failures pass on the reviewed tips; SAMPLE/fixture cannot become a sale; live extract `$0.005` and seller-integrity-audit `$0.01` unchanged; `purchaseAuthorized` stays false; F08 wrappers not rewritten. PRs remain **draft**. Do not merge. F08 not reviewed (already ready).
