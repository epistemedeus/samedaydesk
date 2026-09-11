# FEATURE-MAP — W5-D26 service-cost / price-floor kit

Own directory: `experiments/wave5/d26/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` | Attached. Current F08 wrappers consumed, not rewritten. |
| F08 `server/paid-useful-jobs/` | CLI `bin/cli.mjs` + `runPaidOffer` are the current D01-equivalent interface. |
| W4-commerce-16 `aa306e291adfdd499ca971af01625ccc4bfee5c4` | Read-only worktree. Duration/label honesty reused. Source not copied. |
| W5-D01 / W5-D25 owned paths | Absent on this branch. Remaining integration bindings recorded on the receipt. |
| Homepages, live catalog, `payTo` | Not edited. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Measure F08 job cost and emit one non-lossmaking proposed offer | `bin/price-floor.mjs` | `node bin/price-floor.mjs journey --buyer-class owner-qa` | `certified=true`, `sold=false`, `publishedToLiveCatalog=false` | `test/journey.test.mjs` | None |
| Local HTTP experiment | `lib/http.mjs` | `POST /experiment` on `127.0.0.1` | same JSON as CLI | `test/http.test.mjs` | None |
| Refuse SAMPLE as cost basis | `--example` | `journey --example` | `sample-is-not-cost-basis` | `test/seeded-failures.test.mjs` | None |
| Refuse Stripe fees as x402 certification | `--rail stripe-card-us-standard --certify-as-x402` | same | `unlike-rail-certification` | same | None |
| Show Stripe micropayment is loss-making | `floor --rail stripe-card-us-standard --proposed 0.003` | `nonLossmaking=false` | same | None |
| Refuse 8.105 as cost cover | `--cited-banked-as-cost-cover` | `cited-banked-is-not-cost-cover` | same | None |
| Keep live extract / SIA pins | catalog files | read-only assert | `test/live-prices.test.mjs` | None |

## Files

| Path | Role |
| --- | --- |
| `bin/price-floor.mjs` | Public CLI |
| `lib/experiment.mjs` | Measure + fee + floor + one proposed offer |
| `lib/measure.mjs` | Real F08 CLI process |
| `lib/fees.mjs` | CDP usage-based Exact fee and Stripe card counterfactual |
| `lib/floor.mjs` | Atomic USDC floor |
| `lib/http.mjs` | Loopback JSON server |
| `fixtures/rails/` | Documented fee schedules |
| `test/*.test.mjs` | `node:test` |
