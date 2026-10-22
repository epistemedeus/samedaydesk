# Feature map — W5-M13 machine-discovery consumer

| Field | Value |
| --- | --- |
| User goal | Discover the current SameDayDesk service from existing registries by stable identity, then invoke that exact offline wrapper job. |
| Entrypoint | `experiments/wave5/m13/` (`bin/discover-invoke.mjs`) |
| Command | `node experiments/wave5/m13/bin/discover-invoke.mjs journey --job-id vendor-budget-impact --before … --after …` |
| State | Discovery JSON plus wrapper `unfunded` / `reserved-fixture` / `rejected`; `sold` always false |
| Tests | `node --test --test-concurrency=1 experiments/wave5/m13/test/*.test.mjs` |
| Account prerequisite | None. Offline. No wallet, facilitator, or live MCP call. |
