All attempts remain in this directory. The final success does not erase the original failures.

| Log | Observation and correction |
| --- | --- |
| `00-baseline-prerequisite.log` | First command failed importing missing `viem`. `01-dependencies.log` records the existing root lockfile installation. |
| `02-baseline-http-pg.log` | Candidate copy excluded shipped `runtime/node_modules` source. Copy the complete vendored source, including those tracked members. |
| `03-baseline-http-pg.log` | Candidate omitted pinned client lockfile. Copy every original pin member. |
| `04-baseline-http-pg.log` | Candidate import failed with a bounded module code. Improve fixture diagnostics. |
| `05-baseline-http-pg.log` | Diagnostic identifies missing `client/src/data/machineEntry.mjs`. Copy client source needed by the real configured app. |
| `06-baseline-http-pg.log` | Unsupported original continuation returns 403 through the contributor guard, rather than the initially expected 404. |
| `07-baseline-http-pg.log` | That guard uses the existing `{error:{code}}` envelope, rather than `ok:false`. Receive its actual envelope. |
| `08-baseline-http-pg.log` | Original HTTP/PG behavior passes 2/2 assertions. |
| `09-continuation-http-pg.log` | Synthetic preservation fixture redundantly inserted an ID already recorded by the owning obligation trigger. Make the fixture insert idempotent. Later snapshot failures cascade from that incomplete fixture. |
| `10-continuation-http-pg.log` | Fixture assumed the sender receipt carried `receivedAt`; the receiving import requires an explicit receive timestamp. Preserve the 400 and provide that exact input. |
| `11-continuation-http-pg.log` | Read-only RPC fixture head was below its synthetic transfer block. Supply coherent head/finalized/block/transaction observations; no real RPC route is used. |
| `12-continuation-http-pg.log` | Real existing retained-reader 401 for machine-issued sessions. Preserve it and export the separate Root proposal; keep legacy-issued old-result receiving on its original contract. |
| `13-continuation-http-pg.log` | 17/17 after fixture corrections and the session-expiry source amendment. |
| `14-continuation-http-pg.log` | 19/19 with expiry during RPC and real PostgreSQL crash/WAL recovery. |
| `15-original-retained-session-boundary.log` | 5/5 original-source assertions, including exact original hashes and the native retained-reader refusal. |
| `16-account-profile-regressions.log` | Wrapper exited zero, but inherited `NODE_TEST_CONTEXT` made Node skip the nested regression files. This is **not** accepted regression evidence. Remove that environment marker and assert that both real suite names appear. |
| `17-final-http-pg.log` | 20/20, including a fresh admitted source successor refusing its predecessor's challenge. Peak fixture-only RSS 589,404 KiB. |
| `18-account-profile-regressions.log` | Actual 9/9 required regression tests execute, zero skips/failures. |
| `19-final-http-pg-with-native-reserve.log` | Final HTTP/PG receiving includes the verified owning native process/supervisor in RSS accounting, and rechecks either wallet becoming a contract after challenge issuance. |
| `operating-telemetry.log` | The once-requested `tools/ops/agent-status --json` is absent from this product checkout (127). No unrelated operating tree or job was modified to supply it. |

PostgreSQL 16.15 was reused read-only from the already available extracted runtime at `/tmp/root4000-pg`; its required loader path is recorded in COMMANDS.json. Each test uses its own newly initialized verified-TLS cluster with 32 MiB shared buffers. No existing cluster or other task's runtime was restarted, edited or removed. No model children were launched. All ordinary fixture and source amendments were made by this same admitted owner.

The first export `git diff --cached --check` reported whitespace emitted by Node's raw failed TAP diagnostics. Those evidence bytes and their SHA256 receipts are preserved. Source, Markdown and JSON pass the focused whitespace check with raw `.log` evidence excluded; no runtime or documentation whitespace exemption was added to repository configuration.
