# Feature map — W5-D15 final-input-freeze

| Field | Value |
| --- | --- |
| User goal | At the product prepare→execute boundary, inspected input meaning must match executed bytes. Nested page captures count. |
| Entrypoint | `node server/paid-useful-jobs/bin/deliver.mjs` from a read-only worktree of `46f2b7f` |
| Probe | `node --import lib/preload.mjs` wrapping `runCreateOrder` after preflight returns |
| Owned path | `experiments/wave5/d15/final-input-freeze/` |
| Not product | Loader is a race probe of the real CLI, not a freeze-shim `--bind frozen` and not a toy executor |
| Account prerequisite | None. Offline. No wallet, email, or Postgres. |
