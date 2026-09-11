# Feature map — W4-commerce-18 / W5-M10 recipes vs catalog join

Read-only SameDayDesk conformance join. Not a recipe runner. Not F08 paid wrappers.
Not I01 earned-work. Offer-routing selects offers; this join proves whether a
recipe id, repeat-job family, or routed job is a useful-jobs catalog job id.

Named inputs are **recipes** (specs) and **catalog**. Digests bind the bytes that
were actually loaded. Changing catalog source B must change the join. Internal
source inconsistency refuses with `ok: false`. Recipe-not-catalog is a valid
joined analysis, not a crash.

| Field | Value |
| --- | --- |
| User goal | See that `feed-agenda` is a catalog job, `source-change-alert` is a recipe not in the catalog, and `page_change_evidence` routes to merchant `sdd.page_change_offline`, not the catalog. Changing `--catalog` only must move those classifications with the catalog bytes. |
| Entrypoint | `tools/recipes-catalog-join/` (`bin/join.mjs`, `lib/join.mjs`) |
| Command | `cd tools/recipes-catalog-join && node bin/join.mjs` |
| Named sources | `--catalog PATH` (source B), `--recipe-specs DIR` (source A). Defaults are the published SDS files. `--http` serves those named files over loopback and joins the fetched bodies. |
| Engines consumed | Published `catalog.json`, `specs/*.recipe.json` + `listRecipes()`, S176 `FAMILIES.md` + discovery families, `routeJob` / `routeJobFromFile` |
| State | `executionAuthorized: false`; `paid: false`; `paymentRequiredFromRoutingIsPaid: false`; join is read-only |
| Tests | `cd tools/recipes-catalog-join && npm test` (Node 22 `node:test`, no install) |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, or new account. |

Exact id equality is a **match**. Families whose published tokens overlap a catalog
summary without sharing an id are **adjacent-not-catalog**. Routing paymentRequired
is not paid. I01 hash-terms remain a later Root/Neo binding (`hashTerms.available: false`,
`hashTerms.synthetic: true`). Do not force unlike terms hashes equal.
