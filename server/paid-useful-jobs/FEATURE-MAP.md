# Feature map — F08 paid useful-job wrappers

| Field | Value |
| --- | --- |
| User goal | Turn caller-supplied files into useful-job outputs plus a receipt, without treating fixtures or SAMPLE runs as live sales. Default first offer is lockfile-pin-delta; published useful-jobs stay compatible. |
| Entrypoint | `server/paid-useful-jobs/` (`index.mjs`, `lib/wrapper.mjs`, `CONTRACT.md`) |
| Contract | `samedaydesk.paid-useful-jobs.execution.v1` (`createExecutor` / `runPaidOffer`) |
| Command | `node server/paid-useful-jobs/bin/deliver.mjs --job lockfile-pin-delta --before "$BEFORE_LOCKFILE" --after "$AFTER_LOCKFILE"` |
| State | `unfunded` / `reserved-fixture` / `rejected`; `sold` always false; live settlement out of scope |
| Tests | `npm run test:paid-useful-jobs` plus transferred consumer test scripts |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
