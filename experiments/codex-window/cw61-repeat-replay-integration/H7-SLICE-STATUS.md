# CW61 H7 slice status (parent-owned while CW60/62/70 children run)

Runtime pin consumed: `6007fcfa27074f9a594248e47296f1afa4f8385d` (useful-jobs 1.4.3).
PG 55591: **untested**.
Do not git-commit from this file; parent commits.

## Domain diagnosis of the two inherited catalog failures

`samples/pricing/a/after.json` spells grok-4.6-input unit `USD/1M-Tokens` while `before.json` uses `USD/1M-tokens`. Mutating `gpt-4.1-input` therefore still leaves a unit conflict. Independent expected analysis is **partial**, not actionable. Binder status mapping `partial → analysis-partial` is correct and was not reversed.

## Changes

- Inherited CLI/journey tests now expect `analysis-partial` for that sample.
- New control: clean comparable units (same before bytes as the ticket, numeric-only after change) is `actionable`.
- Durable wrapper-process.json and `.replay-capture/` written per run, including refusal of run A.
- Optional `expectedEngine` pin check on wrapper validation.
- Witness (not readiness): added-row `no-budget-delta` on current legacy vendor engine.

## Serialized suites on this VM (`NODE_OPTIONS=--max-old-space-size=768`, `--test-concurrency=1`, flock)

| Suite | Result |
| --- | --- |
| consumer-regressions.test.mjs | 6 pass / 0 fail |
| binder tests (frozen-refs, journey, missing-files, pins, seeded-failures, terms-hash, local-http-catalog) | 25 pass / 0 fail |
| output-replay-harness/test/*.test.mjs | 21 pass / 0 fail |
| current-wrapper.test.mjs | 19 pass / 0 fail |

Raw log: `evidence/h7/suites.log`. `d01-wrapper.integration.mjs` is opt-in via `SDS_D01_WRAPPER_BIN` and was not required for this pack (expectations updated for the same sample unit conflict). PG 55591 untested.
