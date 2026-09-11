# Primary-source candidates (parent research)

Bounded facts from `epistemedeus/samedaydesk` git history. Children should bind examples to these or stronger public pairs. Unknown stays unknown.

## Schema / webhook

| Pair | SHAs | Path | Fact |
| --- | --- | --- | --- |
| Feed schema required-field add | `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0` → `3c96d3137f815035ed4a6467d28c8041916a9aa8` | `client/public/x402/verified.schema.json` | `$defs.route.required` gains `bazaarObservedAt`; `agreement.required` gains `cdpBazaarFresh` |
| Top-level `qa` dropped | `3c96d3137f815035ed4a6467d28c8041916a9aa8` → `f0b69ad` (resolve full) | same | `/required` no longer includes `qa` |
| Stripe webhook new event | `52d05a5` → `eeb5a28` | `server/routes/stripe-webhook.js` | Handler adds `checkout.session.expired` beside `payment_intent.succeeded` |

Webhook-drift used pointers only. Unused description text is not a consumer break.

## Lockfile

| Pair | SHAs | Fact |
| --- | --- | --- |
| Vulnerable pin bumps | `ff381d2b46e9beec1475212df2eb610a7b01229b` → `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf` | `concurrently` 10.0.3→10.0.5; `qs` 6.15.2→6.16.0; `shell-quote` 1.8.4→1.9.0 (version+integrity) |
| Added optional platform pins | `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf` → `218b2fa74d63951eeeda4cf0a67c420835a58b01` | 59 added `packages` entries (esbuild optional deps); 0 version changes |

## API / public routes

| Pair | SHAs | Fact |
| --- | --- | --- |
| Useful-jobs SPA path added | `9c50ecb` → `abeb54e` (`abeb54e` S260) | `USEFUL_JOBS_SHELL.path` = `/for-agents/useful-jobs` appended to `PUBLIC_SHELLS` |
| Observatory API added | `d4fec15` → `8c1c4f706c75868d1556db483deff98d29758073` | `GET /api/observatory/sources`, `/snapshot`, `/sources/:sourceId` |

Route-table-diff: title-only is not canonical/robots change. Homepage rewrite refused.

## Page facts

| Pair | SHAs | Path | Fact |
| --- | --- | --- | --- |
| Inspected-routes paragraph | `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0` → `3c96d3137f815035ed4a6467d28c8041916a9aa8` | `server/lib/spa-route-shells.js` `/x402/verified` | Description + crawler `<p>` change from “OpenAPI, unpaid 402 output schema, and CDP Bazaar row agree” to “matching CDP Bazaar row was observed within seven days”. Title and h1 stay “Inspected x402 routes” / “Inspected routes, not a certificate”. |

Page-change engine consumes `samedaydesk.extract-batch.v0` snapshots, not raw HTML. Facts inside the snapshot must match the HTML/source excerpt.

## SDS52 jobs (wrapper, not W4)

`api-upgrade-brief`, `vendor-budget-impact`, `feed-agenda`, `evidence-ci-annotation`, `listing-repair-packet`, `repeat-job-record` at SDS52 `aeef964fa188443078958d9d6d393afae1d542ee`. Live settlement out of scope.
