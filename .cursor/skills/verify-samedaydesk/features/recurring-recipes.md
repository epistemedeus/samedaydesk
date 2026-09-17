# recurring-recipes

One-shot prior vs current. Priors are never overwritten. Payment receipts are never replayed.

| field | value |
| --- | --- |
| goal | one-shot prior vs current, never replay pay |
| entrypoint | `tools/recurring-job-recipes/cli.mjs` |
| command | `pack run recurring-recipes` |
| state | `payment_replay_blocked` on the payment-replay candidate |
| tests | `npm run test:recurring-job-recipes` |
| prerequisite | `--prior`, `--schedule`, `--clock`, and an observation source |

## Sub-features

- `list` enumerates recipes.
- `payment-replay` `--candidate …/verify-candidate-payment-replay.json` exit 1 `payment_replay_blocked`.
- `--replay-payment` is `payment_authority_required`.

## How to get to it (user POV)

- `/for-agents` Job 5. `RECURRING_QUICKSTART` in `machineEntry.mjs`.

## Driving it with verify-cli

Preconditions: none for `--list`.

- **List.** `node tools/verify/cli.mjs pack run recurring-recipes --json`.
- **Replay block.** Run the CLI with `--recipe verification-reconcile --prior tools/recurring-job-recipes/fixtures/priors/verify.prior.json --candidate tools/recurring-job-recipes/fixtures/current/verify-candidate-payment-replay.json` (plus required schedule/clock/fields). Expect exit 1.

## Gotchas

- No cron is installed.
- Listed batch price 0.01 USDC is not invoked here.
- Owner QA issues are not demand.
