# Receiving

Root receives this package after the recorded commands below. It is an optional caller module. It does not change the served catalog, a public page, a price, or a payment route.

## Replay

From `tools/task-native-selection-211860` on Node 22:

```sh
npm install --ignore-scripts
npm test
node ./bin/task-native-select.mjs acquire --out acquired
npm test
node ./scripts/cold-install.mjs
```

`npm test` before `acquire` skips the acquired-catalog cases. The second `npm test` runs them. `acquire` is anonymous GET only. Expected live sources are the OpenAPI document, the x402 manifest, `https://samedaydesk.com/discovery/task-readiness.json`, `https://agents.samedaydesk.com/recipes/careers-board-cold`, and `https://agents.samedaydesk.com/v0/cards.json`.

## What a pass means

- Recoverable-receipt task selects `claimReceiptReferralRecheck` with cost state `unknown`. The summary says free. The price object does not.
- Free-readiness task selects `discovery:task-readiness` with known free cost. The cold command is reported and not run.
- Structured-extract task selects `extractUrl` at display amount `0.005` USD. Atomic x402 units stay `units_uncompared`. The next action is not executed.
- Careers-row task against the acquired catalog selects `readNamedCareersBoard` when the caller supplies no direct alternative. The cold recipe's response schema does not declare `rows`, so its "direct free execution" sentence does not win. A caller-supplied direct alternative with that row schema and a known zero price does win, in the unit fixture.
- Flight-number task is `no_fit`.
- `--opt-in` writes a local feedback file whose receipt schema is `samedaydesk.original-task-receipt.v1` and whose amounts use `pilot.observatory-measurement.v1` units. `send` is false. Acceptance stays false unless `--accept` is also present, and that flag is owner QA.

## Do not treat as

Customer revenue, useful acceptance, autonomous external use, or a reason to republish careers. Banked 10.955 USDC is unchanged. `OPTIONAL-INTEGRATION.md` is the only proposed edit outside this directory, and it is not applied.
