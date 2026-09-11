# Feature map — W5-M14 result preview

| Field | Value |
| --- | --- |
| User goal | An unbriefed reader picks the matching job input and can explain whether a report is a useful no-change, a valid refusal, incomplete delivery, or a crash. |
| Entrypoint | `experiments/wave5/m14/` (`bin/preview.mjs`) |
| Command | `node experiments/wave5/m14/bin/preview.mjs quickstart\|choose\|limits\|preview` |
| State | `useful-delivery` / `wrapper-refuse` / `engine-failure` / `transport-failure` / `incomplete-delivery` |
| Tests | `node --test --test-concurrency=1 experiments/wave5/m14/test/*.test.mjs` |
| Account prerequisite | None. Offline. Reuses SDS52 CLI. No wallet, facilitator, or Postgres. |
