# Task-native selection 211860

Caller-side selector for a SameDayDesk machine catalog. A task envelope names the output contract, the inputs the caller can supply, a concrete direct alternative when one exists, and the next action. The selector matches those fields to OpenAPI response schemas, x402 price observations, and `samedaydesk.acquisition-discovery.v1` documents. It does not search summary text and it does not rank an entry higher because the portfolio owns it.

Query, render, selected, executed, and useful acceptance stay separate. Selection does not fetch a paid route, send telemetry, or record acceptance.

## Cold use

```sh
npm install
node ./bin/task-native-select.mjs select --catalog path/to/normalized.json --task path/to/task.json
node ./bin/task-native-select.mjs list --catalog path/to/normalized.json
node ./bin/task-native-select.mjs acquire --out acquired
node ./bin/task-native-select.mjs effort --catalog acquired/normalized.json --task fixtures/tasks/structured-extract.json
node ./bin/task-native-select.mjs execute-synthetic --catalog fixtures/cold-catalog.json --task fixtures/tasks/structured-extract.json --body fixtures/synthetic-extract.json
node ./bin/task-native-select.mjs feedback --result result.json --opt-in --out feedback.json
```

`acquire` performs anonymous GET requests against the declared public description endpoints and writes source bytes, hashes, and coverage. `execute-synthetic` answers a loopback on 127.0.0.1 and labels the result synthetic. It is not external use.

`list` is the undifferentiated catalog dump. It has no selected entry. A task that carries `q` is rejected.

## Limits

- Missing `x-payment-info` is an unknown price, including when a summary says free. `charged: false` inside a response schema does not set the call price.
- x402 atomic amounts stay uncompared when the manifest has no decimals. A structured extra display price that disagrees with OpenAPI makes the price a conflict and the entry ineligible.
- Known-free direct alternatives outrank a known owned price. An unknown-price alternative does not.
- Expiry, removed operations, and changed response-schema hashes remove eligibility. The selector does not silently keep the stale contract.
- Public probes refuse credentials, non-http(s) URLs, local and private addresses, DNS answers in those ranges, redirect hops onto them, and HTTPS downgrades.
- Feedback is a local file written only with `--opt-in`. Nothing in this package posts it.
- Careers and ClawHub distribution is unchanged. This package does not publish a skill and does not scan the registry.

Shared `catalog.json`, site copy, and `package.json` scripts are not modified. See `OPTIONAL-INTEGRATION.md`.
