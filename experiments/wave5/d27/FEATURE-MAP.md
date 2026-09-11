# Feature map — W5-D27 recruited independent-runtime trial kit

| Field | Value |
| --- | --- |
| User goal | Another runtime (Python 3) submits its own files to the current SDS paid wrapper and records usefulness, valid refusal, and friction without inventing demand. |
| Entrypoint | `experiments/wave5/d27/` (`bin/d27-trial.mjs`, `runtime/trial.py`) |
| Command | `node experiments/wave5/d27/bin/d27-trial.mjs first-execution --buyer-class owner-qa` |
| State | `useful-change` / `useful-no-change` / `useful-refusal` / `wrapper-refusal` / `sample-not-sale` / `honesty-refuse` / `transport-failure` |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d27/test/*.test.mjs` |
| Account prerequisite | None. Offline. Python 3 plus Node 22. No wallet, facilitator, Postgres, or recruited buyer. |
