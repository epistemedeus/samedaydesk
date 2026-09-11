# Feature map — F07 consumer evidence refresh

| Field | Value |
| --- | --- |
| User goal | Re-run a customer-owned redacted case against PR50 evidence packages and get a new digest-bound bundle without leaking private data. |
| Entrypoint | `tools/consumer-evidence-refresh/` (`index.mjs`, `lib/refresh.mjs`) |
| Command | `node tools/consumer-evidence-refresh/bin/refresh.mjs --case fixtures/customer-owned-redacted.json --out out/refresh.json` |
| State | `customer_owned` only for non-SAMPLE caller cases; `privateLeak` false on success; `freshness` is `unknown` unless observed; `sold` always false |
| Tests | `tools/consumer-evidence-refresh/test/*.test.mjs` via `npm run test:consumer-evidence-refresh` |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
