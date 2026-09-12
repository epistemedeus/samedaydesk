# FEATURE-MAP — W5-D26 service-cost / price-floor kit

Own directory: `experiments/wave5/d26/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| Live merchant `epistemedeus/x402-url-extractor@ca38205279f0d543515b81b7261909e55ea2600f` v1.23.47 | Read-only pin. `POST /lockfile-pin-delta` at 5000 atomic USDC, x402-only, Railway. Not rewritten. |
| SDS H04 corpus `7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc` | Read-only worktree. Public lockfile pairs under `experiments/wave5-heavy/h04/examples/lockfile-public/` plus SDS lock family. Digests in `fixtures/corpus/h04-lockfile-pairs.json`. |
| SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` | Still attached for the historical F08 0.003 journey. |
| Railway + CDP official pricing | Retrieved 2026-09-12. Production Railway allowlist observed FACILITATOR=cdp. Remaining CDP quota, CDP balance, and Railway plan unread. |
| Homepages, live catalog, `payTo` | Not edited. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Measure mounted lockfile handler cost/latency | `lib/profile.mjs` | `node bin/price-floor.mjs profile` | `certifiedNoLoss=false`, `priceChange=false` | `test/zero-failed-settle.test.mjs` | Fake facilitator only |
| Compact 0.005 recommendation | `lib/lockfile-offer.mjs` | printed by `profile` / `rebind-measured` | keep 0.005; production cdp vs source xpay; no-loss not proven | `test/lockfile-offer.test.mjs` | None |
| Exact source export | `lib/source-export.mjs` | `node bin/price-floor.mjs source-export` | merchant SHA, H04 digests, fee docs, production cdp observation | same | None |
| Rebind captured profile | `lib/rebind-measured.mjs` | `node bin/price-floor.mjs rebind-measured` | no remount; no new CPU/wall/RSS | `test/lockfile-offer.test.mjs` | None |
| Historical F08 0.003 T3/60s scenario | `lib/experiment.mjs` | `journey --buyer-class owner-qa` | `historicalAssumedScenario=true`, not live lockfile | `test/journey.test.mjs` | None |
| Atomic USDC / Railway conversions | `lib/money.mjs`, `lib/railway-fees.mjs` | unit tests | 0.005=5000; no 60s Railway minimum | `test/money.test.mjs`, `test/lockfile-offer.test.mjs` | None |

## Files

| Path | Role |
| --- | --- |
| `bin/price-floor.mjs` | Public CLI |
| `lib/profile.mjs` | Mounted handler + fake facilitator + 1/6/12 |
| `lib/merchant-harness.mjs` | Disposable merchant spawn |
| `lib/railway-fees.mjs` | Per-second Railway CPU/RAM attribution |
| `lib/facilitator-cost.mjs` | CDP vs xpay; success vs failed settle |
| `lib/lockfile-offer.mjs` | Keep-0.005 recommendation; production cdp vs source xpay |
| `lib/rebind-measured.mjs` | Rebind captured profile.json without remounting |
| `fixtures/production-railway-allowlist.json` | Root 2026-09-12 allowlist observation |
| `historical/f08-t3-assumed-scenario.md` | Preserved stage-1 report |
| `measured/` | Replayable JSON/CSV after `profile` |
| `test/*.test.mjs` | `node:test` |
