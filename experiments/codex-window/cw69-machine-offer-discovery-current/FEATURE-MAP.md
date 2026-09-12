# Feature map — CW69 lockfile-pin-delta adapter

| Field | Value |
| --- | --- |
| User goal | Name a linked chain from hosted lockfile offer evidence to a workable local task, then run that exact offline job on caller files. |
| Entrypoint | `experiments/codex-window/cw69-machine-offer-discovery-current/bin/offer.mjs` |
| Command | `node …/bin/offer.mjs discover \| describe \| invoke` |
| State | Discovery/description/invocation JSON; `sold` and `purchaseAuthority` always false |
| Tests | `node --test --test-concurrency=1 experiments/codex-window/cw69-machine-offer-discovery-current/test/*.test.mjs` |
| Account prerequisite | None. Default path is offline. Optional `--live-rebind` is GET-only against documented capture URLs. |
