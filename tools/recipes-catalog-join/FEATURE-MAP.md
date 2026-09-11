# Feature map — W4-commerce-18 recipes vs catalog join

Read-only SameDayDesk conformance join. Not a recipe runner. Not F08 paid wrappers.
Not I01 earned-work. Offer-routing selects offers; this join proves whether a
recipe id, repeat-job family, or routed job is a useful-jobs catalog job id.

| Field | Value |
| --- | --- |
| User goal | See that `feed-agenda` is a catalog job, `source-change-alert` is a recipe not in the catalog, and `page_change_evidence` routes to merchant `sdd.page_change_offline`, not the catalog. |
| Entrypoint | `tools/recipes-catalog-join/` (`bin/join.mjs`, `lib/join.mjs`) |
| Command | `cd tools/recipes-catalog-join && node bin/join.mjs` |
| Engines consumed | Published `catalog.json`, `specs/*.recipe.json` + `listRecipes()`, S176 `FAMILIES.md` + discovery families, `routeJob` / `routeJobFromFile` |
| State | `executionAuthorized: false`; `paid: false`; `paymentRequiredFromRoutingIsPaid: false`; join is read-only |
| Tests | `cd tools/recipes-catalog-join && npm test` (Node 22 `node:test`, no install) |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, or new account. |

Exact id equality is a **match**. Families whose published tokens overlap a catalog
summary without sharing an id are **adjacent-not-catalog**. Routing paymentRequired
is not paid. I01 hash-terms remain a later Root/Neo binding (`hashTerms.available: false`).
