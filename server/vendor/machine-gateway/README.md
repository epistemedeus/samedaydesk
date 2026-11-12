# Machine gateway

A reusable Node 22.14+ HTTP service, mounted at `/api/machine-gateway`. This
branch prepares a deployment; it does not assert a live Neomorphic gateway.
The static Astro host cannot execute this service. The deployment target is
the existing SameDayDesk Hostinger Node process, without a new hosting plan.

The built-in free routes perform useful work: `lockfile.delta` compares caller
npm lockfile texts with the accepted SameDayDesk engine, and `http.capture`
returns a bounded public HTTP response with bytes and SHA-256. Inputs and
outputs have closed JSON schemas. Providers register deployment-owned handlers,
schemas, price, timeout and output bounds through `RouteRegistry`.

Public `GET /v1/discover`, `POST /v1/quote`, and `POST /v1/test` need no payment.
Anonymous quotes are previews and cannot execute. Authenticated quotes bind the
tenant, route revision, price and exact input for 60 seconds. Test responses
are explicitly fixtures and do not call providers or payment clients.

`POST /v1/execute` requires a scoped bearer, the quote, input, `maxUnits` and an
`Idempotency-Key` of 16–128 safe ASCII characters. Each tenant has persistent
call and spend limits, a route allowlist and a concurrency bound. A quote admits
one execution only. Retry the identical request with the same key to recover
its receipt. `GET /v1/receipts/{id}` requires the same tenant authority.

SQLite FULL-WAL transactions reserve budgets and persist possible payment
before any settlement call. A lost response, disconnect, crash or deadline
never authorizes resending a possible payment. Incomplete executions become
`uncertain` at their persisted deadline and remain recoverable. Receipts and
payment identity tombstones are retained, including after restart.

The 0.1.1 receiving candidate checks the persisted deadline at provider and
adapter entry even when a JavaScript timer is delayed. Isolated facilitator
workers discard SDK stdout/stderr so upstream diagnostics cannot enter host
logs. The original 0.1.0 archive remains unchanged; the dedicated machine
manifest selects the new immutable candidate and still records no live route.

Paid routes are disabled by default. The optional adapter accepts an existing
enrolled `@x402/core` facilitator client; it delegates `verify` and `settle`
without constructing a wallet, signer or escrow. This version admits exact
EVM EIP-3009 v2 requirements only. Its isolated SDK transport blocks redirects,
bounds replies and closes on timeout/abort. The payment tests use unsigned local fixtures;
they prove the execution boundary, not live settlement or revenue.

Run from this repository, with host serialization:

```sh
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm ci --ignore-scripts --no-audit --no-fund --prefix services/machine-gateway
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm run check --prefix services/machine-gateway
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm test --prefix services/machine-gateway
```

Installed-package command help requires no credential or running server:
`node bin/enroll.mjs --help`, `node bin/readiness.mjs --help`, and
`node bin/caller.mjs --help`. To exercise the exact selected archive instead of
packing current source, set `MACHINE_GATEWAY_TEST_ARCHIVE` to its absolute path
when running `node --test services/machine-gateway/tests/cold.test.mjs` under
the same host lock. That check installs only the archive's locked production
dependencies, executes useful lockfile work, restarts, and resumes its receipt.

### Client errors, cancellation and recovery

`bin/client-io.mjs#request` throws `GatewayRequestError`. Its `message` keeps
the earlier values (`gateway_http_<status>`, `gateway_response_too_large`).
`code` is the server's own code when it sent one (`{error:{code}}` or
`{ok:false,code}`), including codes this client does not know yet. Otherwise
`code` equals `message`. `operation` keeps the method, path and idempotency key.
`diagnostics` hold the phase, status, content type, byte count and a body
digest, never a credential, request body or response text.

`recovery` says what the client observed. It is not an exactly-once promise.
It does not cover loss of the caller's own state file or host.

| recovery | meaning | next step |
| --- | --- | --- |
| `not_sent` | aborted before dispatch, recovery record not saved, or connection refused | safe to start again |
| `sent_unconfirmed` | dispatch began, no server outcome received (local abort, SIGINT, timeout, reset, 5xx, non-JSON) | `--resume`; the gateway replays the same key and digest without running again |
| `remote_refused` | server answered with an error code | fix input; the code is final for this attempt |
| `remote_committed` | server answered 2xx, possibly with the body lost | `--resume` reads back by receipt ID or the same key |
| `remote_cancelled` | the server reported `execution_aborted` | the receipt records the abort |

`signal` accepts an `AbortSignal`. A local abort is never reported as a remote
cancellation, and an abort after dispatch is `sent_unconfirmed`, not
`not_sent`. `beforeDispatch(record)` runs before a POST is sent; if it throws,
nothing is sent. `bin/caller.mjs` uses it to save a nonsecret dispatch record
(method, path, key digest, attempt count) in its 0600 state file before
execution. SIGINT exits 130 and leaves remote work alone. With a saved receipt
ID, `--resume` reads `/v1/receipts/<id>` and sends no POST. `request` never
retries a POST. `tests/caller-recovery.test.mjs` drops a committed execute
response, resumes in a fresh process, and checks the store's commit count.

`SOURCE.json` records the exact fetched sibling SHAs, inspected integration
boundaries, unchanged vendored files and checksums. No shared navigation,
homepage, `site.ts` or `commerce.astro` change is required to run the service.

See [deployment commands](deploy/RUNBOOK.md), the [focused host patch](deploy/samedaydesk.patch),
[OpenAPI](openapi.json), [exported schemas](schemas/contracts.json), and
[launch integration suggestion](deploy/LAUNCH-INTEGRATION.md). The dedicated
`public/machine/machine-gateway.json` stays `prepared-not-deployed` until Root
records production readback. Runtime tests cover sockets, processes, cold npm
installation and CLI recovery; the explicit `tests/public-smoke.mjs
--public-read-only` command additionally exercises one real free public response.
