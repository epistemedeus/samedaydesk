# Feature map — F05 managed listing repair

| Field | Value |
| --- | --- |
| User goal | Bind a listing source observation as evidence, emit a one-field suggestion, and keep publishing unauthorized. |
| Entrypoint | `tools/managed-listing-repair/` (`index.mjs`, `lib/repair.mjs`) |
| Command | `cd tools/managed-listing-repair && node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json` |
| State | `publishAuthorized` always false; `accepted_correction` always false; suggestion is not a publish; `sold` always false |
| Tests | `tools/managed-listing-repair/test/*.test.mjs` via `npm run test:managed-listing-repair` |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
