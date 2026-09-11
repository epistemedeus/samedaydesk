# W5-M12 capability and pricing description

Machine-readable description of the selected SameDayDesk supplied-input offer.
Jobs, prices, and limits are read from SDS52. They are checked against the wrapper
CLI and live catalog pins. This is not a second paid-job kernel.

| Goal | Entrypoint | Command | State | Tests | Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Describe selected offer | `bin/describe.mjs` | `node bin/describe.mjs` | JSON schema `samedaydesk.wave5.m12.offer.v1` | `test/cli-describe-verify.test.mjs` | SDS52 catalog and pins |
| Verify advertised claims | `bin/verify.mjs` | `node bin/verify.mjs` | Every job/price/limit matches runtime or fails closed | cli-describe-verify, advertised-mismatch | wrapper CLI and engine archive |
| Optional M01 / D26 | `lib/sources.mjs` | default paths or `W5_M01_SELECTED` / `W5_D26_COST` | Unbound is recorded. A measured price without D26 fails | `test/sibling-bindings.test.mjs` | none |
| Offer HTTP | `bin/serve.mjs` | `GET /offer` on 127.0.0.1 | Same JSON as describe. Not D01 execution HTTP | cli-describe-verify | none |

Postgres is unused. A missing wrapper or engine fails the run. It is not a skipped pass.
