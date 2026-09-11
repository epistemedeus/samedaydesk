# W5-M19 distribution integration

Thin consumer of current partner/registry events. One supported contribution:
MCP Registry version-only publish of `io.github.epistemedeus/x402-data-gateway`.

| Goal | Entrypoint | Command | State | Tests | Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Load current events | `lib/events.mjs` | `node bin/distribute.mjs events` | Presence fixture pack 2026-09-03 plus consumer capture 2026-09-09 stay unlike | `test/events.test.mjs` | SDS52 `tools/presence` |
| Select one contribution | same | `select` | mcp-registry version-only. Bazaar/MPP/grexal/scan refused | `test/refusals.test.mjs` | same |
| Dry-run submit | `lib/integrate.mjs` | `submit` / `--apply` fixture | Transport fixture-fetch. Delivery not published | `test/submit-consume.test.mjs` | presence `runSurface` |
| Consume latest | same | `consume` | `/versions/latest` and `version=latest`. Unfiltered first hit refused | same | registry-consumer |
| Invoke selected offer | wrapper CLI | `invoke` | vendor-budget-impact via SDS52 CLI. SAMPLE is not a contribution | `test/journey.test.mjs` | useful-jobs archive |
| Loopback HTTP | `bin/serve.mjs` | GET `/health` POST `/journey` | Same kernel as CLI | `test/http.test.mjs` | Node >= 22 |

Postgres is unused. There is no store. A missing presence/wrapper file fails the run. It is not a skipped pass.

Live publish, partner email, payout, and production deploy are remaining Root steps.
