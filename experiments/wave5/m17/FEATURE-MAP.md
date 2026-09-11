# FEATURE-MAP — W5-M17 reproducible API-route change trial

Owner-labelled dry run. Consumes the current Co12 CLI. Does not edit
`server/lib/spa-route-shells.js`, homepages, or the M04 engine.

## Caller journey

| Goal | Entrypoint | Command | State | Tests |
| --- | --- | --- | --- | --- |
| Resolve pinned Co12 | `bin/trial.mjs engine` | `node experiments/wave5/m17/bin/trial.mjs engine` | Engine path + SHA, no vendor copy | `test/engine-pin.test.mjs` |
| Permutation vs digest | Co12 CLI via `lib/run-engine.mjs` | live `SPA_ROUTE_SHELLS` reversed | `analysis_no_change` with unequal `tableDigest` | `test/permutation.test.mjs` |
| MCP method collision | live `createSdsApp` + Co12 | GET+POST `/mcp` mapped to path-only rows | `duplicate_path` refusal | `test/mcp-api-collision.test.mjs` |
| SPA vs API domain | `createSdsApp` vs `mountProductionClient` | GET `/x402` | API 404, SPA shell 200 | `test/spa-vs-api-domain.test.mjs` |
| Full dry run | `bin/trial.mjs run` | `--out-dir <dir>` | `trial-result.json`, no sale | `test/cli-run.test.mjs` |

## Recorded analysis vs failure

| Kind | Meaning |
| --- | --- |
| `analysis_no_change` | added/removed/changed are 0. Digest inequality is not a break. |
| `analysis_change` | Co12 listed a canonical/robots/path set change |
| `analysis_refusal` | Valid Co12 refuse (`duplicate_path`, `invalid_path`, `homepage_rewrite_refused`, …) |
| `transport_failure` | Loopback catalog HTTP failed |
| `engine_failure` | Crash, non-JSON, or killed process |
| `incomplete` | M04 CLI missing. Never a skipped pass. |

## Non-claims

No payment, deploy, third-party customer, or clean-env package proof (D24 unbound).
M08 framework parsers are unbound. Postgres is not an input.
