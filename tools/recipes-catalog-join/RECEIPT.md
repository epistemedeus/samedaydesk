# W4-commerce-18 RECEIPT — recipes vs useful-jobs catalog join

**Date:** 11 September 2026
**Branch:** `codex/w4-commerce-18-20260911`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)
**HEAD:** `450b24542a6ba1d5460022e7b8959e3e360cb912` on `codex/w4-commerce-18-20260911`
**Repo:** `epistemedeus/samedaydesk`

## What

A read-only join in `tools/recipes-catalog-join/`. It reads published recipe specs,
the recipe runner `listRecipes()` API, S176 family ids, useful-jobs `catalog.json`,
and the offer-routing matrix via `routeJob`. It emits `join-report.json` (stdout or
`--out`). It does not reimplement recipes, does not edit catalog or recipes, and does
not treat routing `paymentRequired` as paid.

I01 (Neo PR54 earned-work / hash-terms) is not in this checkout. The join records
`hashTerms.binding: later-integration` and does not import original F01.

## Live/source checked first

| Surface | Result |
| --- | --- |
| `client/public/for-agents/useful-jobs/catalog.json` | Present at pin. Six jobs. `purchaseAuthority: false`. `feed-agenda` is a catalog job. |
| `tools/recurring-job-recipes/specs/*.recipe.json` | Four specs. `source-change-alert` is not a catalog job id. |
| Runner `listRecipes()` | Six recipes. Two runner-listed without specs: `comparable-record-extraction`, `verification-reconcile`. |
| `experiments/s176-record-repeat-package/docs/FAMILIES.md` | Four families; ids agree with `discovery/record-repeat.json`. |
| `tools/offer-routing/route-job.mjs` | Published `page-change-evidence.job.json` selects `sdd.page_change_offline`, product `samedaydesk`, not catalog. `bounded_html_observation` has `paymentRequired: true`, `paid: false`. |
| Neo PR54 I01 | Absent from this Cloud checkout (`gh` cannot resolve `epistemedeus/neomorphic-io`). No competing kernel copied. |

## Literal journey

```sh
cd tools/recipes-catalog-join
node bin/join.mjs
```

Journey: report lists `feed-agenda` as `catalog`, `source-change-alert` as
`recipe-not-catalog`, and `page_change_evidence` routed to
`sdd.page_change_offline` (merchant, not catalog). `executionAuthorized` stays false.

Loopback HTTP of the same published files (not a rewritten fixture):

```sh
node bin/join.mjs --http
```

## Seeded failures

| Input | Must refuse |
| --- | --- |
| `fixtures/seeded/recipe-as-catalog-job.json` / `--claim-recipe-as-catalog-job source-change-alert` | claiming a recipe is a catalog job id |
| `fixtures/seeded/payment-required-as-paid.json` / `--treat-payment-required-as-paid` | treating routing `paymentRequired` as paid |
| `fixtures/seeded/mutate-catalog.json` / `--edit-catalog` `--edit-recipes` `--out` to catalog path | editing recipes or catalog |

## Tests

```bash
cd tools/recipes-catalog-join
node --test --test-concurrency=1 test/*.test.mjs
```

Equivalent: `npm test` in this directory (no extra install; Node >= 22).

**PASS** — 9 tests, 0 fail.

Evidence classes: filesystem join is `local-runtime-fs`. `--http` loads catalog,
specs, and families over loopback HTTP of those published files (`local-runtime-http`
or `mixed` because `listRecipes()` remains a file import). Seeded JSON files are
fixtures for illegal claims, not substitutes for the published surfaces.

## Honestly untested

- Real local Postgres: `initdb` is not on this Cloud image. No invented payment
  table. Join does not persist settlement.
- Live `agents.samedaydesk.com` catalog fetch (external). Local HTTP is the
  server path that was run.
- I01 hash-terms contract bytes from Neo PR54 (repo not readable here).
- Recipe execution / paid extract / F08 wrappers (out of scope).

## Next integration owner

Root. Bind I01 hash-terms if Neo PR54 is attached. Do not merge this as a
recipe or catalog rewrite.

## Hard stops honored

No deploy, purchase, live payment, account change, or customer messages.
Homepage brands untouched. Root `package.json`, `server/pricing.js`, and
F08/W2/W3/H directories not edited. Swarm skill install stayed out of the
product diff. Upstream licenses left in place; this module only reads those
files.
