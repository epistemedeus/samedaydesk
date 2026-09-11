# Thin HTTP consumer for D01 execution (W5-D14)

This package is a fetch-only client of `samedaydesk.paid-useful-jobs.execution.v1`.
It is not a second useful-jobs server and it does not vendor the wrapper.

## How to submit caller JSON and fetch the result

1. Start D01 loopback from the D01 checkout (not this folder):

```bash
node server/paid-useful-jobs/bin/serve-execution.mjs
```

The process prints one JSON line with `origin`.

2. From the SameDayDesk repository root, submit caller-owned JSON files. The
client sends the file bytes in `POST /execute`. It does not send filesystem
paths.

```bash
node experiments/wave5/d14/bin/http-consumer.mjs submit \
  --base http://127.0.0.1:PORT \
  --job vendor-budget-impact \
  --before experiments/wave5/d14/fixtures/caller/vendor-budget-impact/before.json \
  --after experiments/wave5/d14/fixtures/caller/vendor-budget-impact/after.json \
  --ticket /tmp/w5-d14-ticket.json
```

3. In a second process, fetch that execution:

```bash
node experiments/wave5/d14/bin/http-consumer.mjs fetch \
  --ticket /tmp/w5-d14-ticket.json \
  --out /tmp/w5-d14-result.json
```

`fetch` uses `GET /results/:id` from the ticket. It does not rerun the job.

## Classify outcomes

The client labels HTTP failures separately from D01 contract JSON:

- `http-transport-failure` means the request did not return contract JSON (refused connection, HTTP 400/404/5xx).
- `execution-transport-failure` means HTTP 200 with D01 `transport` of crash, timeout, or acquisition-failed.
- `contract-refusal` means HTTP 200 with `ok: false` for a truthful wrapper refusal such as `sample-not-a-sale` or `unknown-job`.
- `analysis-outcome` means HTTP 200 with `ok: true`. A useful no-change or refusal report from the engine is not a crash.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d14/test/*.test.mjs
```

Tests spawn D01 `serve-execution.mjs` at pin `6bed72dd22a396134aa5c957933b42c3a5746698` when this branch does not contain that file. Missing D01 HTTP is a failed run, not a skip.

## Limits

Non-JSON inputs (XML, YAML) are refused here. D01 `POST /execute` still treats a non-JSON string as a filesystem path. GET `/results/:id` returns the contract object, including output sha256. Artifact file bytes stay on the D01 host path until D01 adds an HTTP payload.
