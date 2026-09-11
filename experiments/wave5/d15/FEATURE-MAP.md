# Feature map — W5-D15 input/execute race harness

| Field | Value |
| --- | --- |
| User goal | After preflight, mutate the caller path. Execute either the frozen bytes or refuse `input-changed-after-preflight`. |
| Entrypoint | `experiments/wave5/d15/` (`bin/d15-race.mjs`, `lib/race.mjs`) |
| Command | `node experiments/wave5/d15/bin/d15-race.mjs run vendor-budget-impact --before … --after … --bind frozen --mutate-after after` |
| State | `frozen-consumed` / `accurate-refuse` / `race-consumed-mutated` / `wrapper-refuse` / `engine-failure` / `transport-failure` |
| Tests | `node --test experiments/wave5/d15/test/*.test.mjs` |
| Account prerequisite | None. Offline. Reuses SDS52 CLI. No wallet, facilitator, or Postgres. |
