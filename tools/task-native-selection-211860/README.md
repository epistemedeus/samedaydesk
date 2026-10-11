# Task-native selection 211860

Caller-side selector for a SameDayDesk machine catalog. A task envelope names the output contract, the inputs the caller can supply, a concrete direct alternative when one exists, and the next action. The selector matches those fields to OpenAPI response schemas, x402 price observations, and `samedaydesk.acquisition-discovery.v1` documents. It does not search summary text and it does not rank an entry higher because the portfolio owns it.

Query, render, selected, executed, and useful acceptance stay separate. Selection does not fetch a paid route, send telemetry, or record acceptance. `meaningId` is a task label. It does not establish semantic equivalence.

## Output guarantee

`requiredOutput` is an allowed output set: the values the caller can use. A producer supports that set only when its schema demonstrates that every value it may emit on each required path stays inside the set. Selection then records `outputClaim: demonstrated_guarantee`. A producer type of string or null does not demonstrate string. A producer enum that contains extra values does not demonstrate the narrower enum. A producer that is narrower than the allowed set does demonstrate its own smaller set. `anyOf`, `oneOf`, `allOf`, `$ref`, `not`, `if`, `then`, `else`, `dependentSchemas`, and `patternProperties` are `schema_unsupported`. Integer is not treated as number. The selector does not invent a reading for those constructs.

## Price comparison

Known free is a structural zero and remains a strong direct alternative. Positive amounts compare as exact decimal strings only when both currency codes are the same `^[A-Z]{3}$` value. A missing currency on a caller quote is `undenominated`, not a known USD price. Different currencies, unknown prices, and undenominated quotes stay in `alternatives` with `economicComparison: unresolved` and `impliedCheapest: false`. That list is traced by entry id. It is not an economic order, a payment gate, or a budget.

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

`acquire` performs anonymous GET requests against the declared public description endpoints and writes source bytes, hashes, and coverage. `execute-synthetic` sends the entry's declared HTTP method to a loopback on 127.0.0.1 and checks the response body against the output schema. The result is a response-schema fixture: `faithfulInvocation` is false, and it is not a real service invocation.

`list` is the undifferentiated catalog dump. It has no selected entry. A task that carries `q` is rejected.

## Limits

- Missing `x-payment-info` is an unknown price, including when a summary says free. `charged: false` inside a response schema does not set the call price.
- x402 atomic amounts stay uncompared when the manifest has no decimals. A structured extra display price that disagrees with OpenAPI makes the price a conflict and the entry ineligible.
- A known-free direct alternative dominates a positive or unknown price. An unknown price beside a denominated price stays unranked. The selector does not call that pair cheapest.
- Expiry, removed operations, and changed response-schema hashes remove eligibility. The selector does not silently keep the stale contract.
- Public probes refuse credentials, non-http(s) URLs, local and private addresses, DNS answers in those ranges, redirect hops onto them, and HTTPS downgrades.
- Feedback is a local file written only with `--opt-in`. Nothing in this package posts it.
- Careers and ClawHub distribution is unchanged. This package does not publish a skill and does not scan the registry.

Shared `catalog.json`, site copy, and the repository root `package.json` are not modified. See `OPTIONAL-INTEGRATION.md`. `RECEIVING.md` is the 211860 snapshot. `RECEIVING-211876.md` is the later correction receipt. `consume` hands a qualified readiness selection to the vendored public adapter at pin `00267aeb03c3ce01b9b318f5ee0172aee34d7e34`. It does not execute catalog `coldStart` text. `RECEIVING-211879.md` records that consumer run.
