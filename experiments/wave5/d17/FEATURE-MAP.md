# Feature map — W5-D17 domain-outcome contract

| Field | Value |
| --- | --- |
| User goal | Tell a successful change report, a valid no-change report, and a delivered refusal apart from transport/engine failure and incomplete delivery. |
| Entrypoint | `experiments/wave5/d17/` (`src/classify.mjs`, `bin/classify-domain-outcome.mjs`) |
| Command | `node --test --test-concurrency=1 experiments/wave5/d17/test/*.test.mjs` |
| State | `analysis_change` / `analysis_no_change` / `analysis_refusal` / `analysis_partial` / `incomplete_delivery` / `engine_failure` / `transport_failure` / `wrapper_refusal` |
| Tests | `experiments/wave5/d17/test/*.test.mjs` against `server/paid-useful-jobs/bin/cli.mjs` |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, or new account. |
