# Receiving

Root receives this package after the recorded commands below. It is an optional caller module. It does not change the served catalog, a public page, a price, or a payment route.

## Replay

From `tools/task-native-selection-211860` on Node 22. Recorded 2026-10-11.

| Command | Exit |
| --- | --- |
| `npm install --ignore-scripts` | 0 |
| `npm test` before acquire | 0 (19 pass, 2 skipped) |
| `node ./bin/task-native-select.mjs acquire --out acquired` | 0 |
| `npm test` after the extract-contract correction | 0 (21 pass, 0 fail) |
| `node ./scripts/cold-install.mjs` | 0, selected `extractUrl` |
| `node ./bin/task-native-select.mjs execute-synthetic --catalog fixtures/cold-catalog.json --task fixtures/tasks/structured-extract.json --body fixtures/synthetic-extract.json` | 0, `synthetic_loopback`, contract ok, acceptance not observed |
| `node ./bin/task-native-select.mjs feedback --result … --opt-in --out receipts/feedback-sample.json` | 0, `send` false, `accepted` false |
| `node ./bin/task-native-select.mjs feedback` without `--opt-in` | 2, no file written |

Acquire at `2026-10-11T10:52:04.195Z`, zero redirects: openapi 200/166766 bytes sha256 `494244be833b050626c0fcf3a4fe8d3130fea45548c8880e1a91f73b7328a3f0` contract valid; x402 200/62752 `c494c318934c248cc35d0a61589df144550039d11042f3164265e607f5a2b4df` valid; task-readiness 200/3408 `5139834edf36fca8ee39204c106e56f0423267e98a9efbfb9a464393c9ec9c80` valid; careers cold recipe 200/31387 `48cacf1d4f3d13e92ccdbbc0c515657e8cd7779fbec04cc0f265b105f0429e90` valid against its schema while its catalog price stayed `unknown`; cards 200/11825 `85e9c815048cc573e7dcd64e6ea497b00c10aad49b8b057e5a02c698ef3b12a4` schema absent.

The first acquired evaluation expected `jsonLd` to be required and got `no_fit` with `path_optional:jsonLd`. That attempt is kept as `fixtures/tasks/extract-summary-fields.json`. The positive extract task uses the fields the schema actually requires.

Effort on this machine, with no savings claim: OpenAPI GET 233ms for 48 operations and no selection; parse-and-list of the normalized catalog 1.5ms; selector 2.3ms selecting `extractUrl`; cold `npm install` of the tarball 351ms. See `receipts/effort.json` and `receipts/cold-install.json`.

## What a pass means

- Recoverable-receipt task selects `claimReceiptReferralRecheck` with cost state `unknown`. The summary says free. The price object does not.
- Free-readiness task selects `discovery:task-readiness` with known free cost. The cold command is reported and not run.
- Structured-extract task selects `extractUrl` at display amount `0.005` USD when the task requires `title`, `requestedUrl`, `finalUrl`, and `sourceOk`. Those are required by the acquired response schema. `jsonLd`, `headings`, and `links` are properties the summary names and the schema does not require, so a task that requires them is `no_fit` with `path_optional:jsonLd`. Atomic x402 units stay `units_uncompared`. The next action is not executed.
- Careers-row task against the acquired catalog selects `readNamedCareersBoard` when the caller supplies no direct alternative. The cold recipe's response schema does not declare `rows`, so its "direct free execution" sentence does not win. A caller-supplied direct alternative with that row schema and a known zero price does win, in the unit fixture.
- Flight-number task is `no_fit`.
- `--opt-in` writes a local feedback file whose receipt schema is `samedaydesk.original-task-receipt.v1` and whose amounts use `pilot.observatory-measurement.v1` units. `send` is false. Acceptance stays false unless `--accept` is also present, and that flag is owner QA.

## Do not treat as

Customer revenue, useful acceptance, autonomous external use, or a reason to republish careers. Banked 10.955 USDC is unchanged. `OPTIONAL-INTEGRATION.md` is the only proposed edit outside this directory, and it is not applied.
