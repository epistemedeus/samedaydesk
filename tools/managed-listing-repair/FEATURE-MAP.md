# Feature map — managed listing repair

| Field | Value |
| --- | --- |
| User goal | Bind a listing source observation as evidence, emit a one-field suggestion, and keep publishing unauthorized. |
| Entrypoint | `tools/managed-listing-repair/` (`index.mjs`, `lib/repair.mjs`) |
| Command | `cd tools/managed-listing-repair && node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json` |
| Engine | Current public useful-jobs kit `listing-repair-packet` (1.4.7 inherited job; originated PR51). Not reimplemented. |
| State | `publishAuthorized` always false; `accepted_correction` always false; suggestion is not a publish; `sold` always false; `purchaseAuthorized` always false |
| Tests | `cd tools/managed-listing-repair && node --test --test-concurrency=1 test/*.test.mjs` |
| Write boundary | `tools/managed-listing-repair/**` only |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
