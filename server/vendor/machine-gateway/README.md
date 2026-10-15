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
