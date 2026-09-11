# Feature map — F08 paid useful-job wrappers

| Field | Value |
| --- | --- |
| User goal | Turn caller-supplied files into the six useful-job outputs plus a receipt, without treating fixtures or SAMPLE runs as live sales. |
| Entrypoint | `server/paid-useful-jobs/` (`index.mjs`, `lib/wrapper.mjs`, `CONTRACT.md`) |
| Contract | `samedaydesk.paid-useful-jobs.execution.v1` (`createExecutor` / `runPaidOffer`) |
| Command | `node server/paid-useful-jobs/bin/deliver.mjs --job vendor-budget-impact --before … --after …` |
| State | `unfunded` / `reserved-fixture` / `rejected`; `sold` always false; live settlement out of scope |
| Tests | `npm run test:paid-useful-jobs` plus transferred consumer test scripts |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
