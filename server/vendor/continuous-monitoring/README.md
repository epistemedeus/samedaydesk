# Continuous monitoring service

A working, dependency-free Node 22 service for finite, tenant-owned monitoring of public HTTP resources. It runs a durable scheduled worker, establishes immutable baselines, emits factual before/after changes, and delivers them to an authenticated API inbox with retries, acknowledgement and readback. **This feature branch is not deployed.** Public offers and homepages are unchanged.

```sh
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm run demo --prefix services/continuous-monitoring
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm test --prefix services/continuous-monitoring
```

The free demo starts a mounted changing HTTP origin, a separate API process and one-shot worker processes using a private temporary SQLite database. It changes a price from 10 to 14, restarts the API, has a consumer read and acknowledge the delivered diff, restarts again and reads back both delivery and original baseline. It stops its own processes and deletes the temporary store. No external URL, account, provider, model, purchase or production change is involved. Metrics identify this as mounted HTTP evidence, not customer demand or public-source drift.

Production observations permit public HTTPS on port 443 only. Each run makes at most one GET. DNS and body reading share a deadline; every DNS address must be public and the chosen address is pinned to the connection. Redirects, URL credentials, queries, fragments, suspicious credential paths, compressed bodies and partial responses are refused. Private-network access exists only for one exact `127.0.0.1` demo origin supplied in private runtime configuration, with `demo: true`; production refuses that exception.

Modes:

- `http`: compares status, media type and body SHA-256, including availability or a 402 challenge; never buys through the challenge. The response body is not retained.
- `json`: compares explicitly selected JSON pointers; every pointer must be present. Selected public values and their diff are retained. Required missing fields, malformed JSON and truncation are unavailable evidence and preserve the prior baseline.
- `observatory`: uses Neo's existing source-projection adapter for one of `moltjobs`, `x402stats`, `smithery_mcp`. Partial/stale coverage stays unavailable rather than zero.

JSON configuration example, sent to `POST /v1/monitors` with an operator-provisioned owner bearer credential and a stable `Idempotency-Key`:

```json
{
  "url": "https://example.com/public/prices.json",
  "mode": "json",
  "pointers": ["/price", "/asset", "/recipient"],
  "intervalMs": 3600000,
  "budget": { "maxChecks": 100, "maxEvents": 50, "timeoutMs": 5000, "maxBodyBytes": 65536 },
  "retentionDays": 7
}
```

This is an API-shape example, not an assertion that the example URL publishes these fields. No arbitrary authentication headers or source secrets are accepted. A dedicated reader credential can inspect monitors, runs, snapshots, events and usage; it cannot create monitors, claim inbox deliveries, acknowledge or change lifecycle. Baselines are inspection outputs, not deliveries. Events are useful changes, unavailable evidence and service restoration. Diff values do not authorize payment, release or production changes.

Actual mounted and public-read evidence is documented in [VALIDATION](evidence/VALIDATION.md); the current public Observatory metrics are partial, so its live cold-install baseline assumption is not satisfied. Read [OPERATIONS](docs/OPERATIONS.md) for consumer and recovery semantics, [deployment](deploy/README.md) for existing Linux infrastructure, [launch integration](docs/LAUNCH-INTEGRATION.md) for Root's public-state handoff, [source reuse](docs/SOURCE-REUSE.md), [machine manifest](machine-manifest.json), and [OpenAPI](openapi.json).
