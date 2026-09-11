# Feature map — W5-D15 input/execute race harness

| Field | Value |
| --- | --- |
| User goal | Mutate the caller path between inspect, materialize, and execute. The kernel must use inspected bytes or refuse, with a matching receipt. |
| Entrypoint | `experiments/wave5/d15/` (`bin/d15-race.mjs`, `lib/kernel-race.mjs`) |
| Product tests | `node --test experiments/wave5/d15/test/*.test.mjs` against D01 `execution.v1` at `6bed72dd` and SDS52 `aeef964` |
| Not product | Harness `--bind frozen` / `--bind verify-live` freeze shim |
| Account prerequisite | None. Offline. Read-only git worktrees. No wallet, facilitator, or Postgres. |
