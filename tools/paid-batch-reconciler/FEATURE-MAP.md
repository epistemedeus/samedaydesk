# Feature map — W5-D12 paid-batch reconciler

| Field | Value |
| --- | --- |
| User goal | Run N fixture-funded useful-job items through one runner, get a batch ledger with distinct item-level price/outcome/fundingState, reject duplicate/traversing items, keep sold false. |
| Entrypoint | `tools/paid-batch-reconciler/` (`index.mjs`, `lib/ledger.mjs`) |
| Command | `node tools/paid-batch-reconciler/bin/batch.mjs run <request.json>` |
| Local HTTP | `POST http://127.0.0.1:<port>/batch` via `bin/batch.mjs serve` |
| State | item `unfunded` / `reserved-fixture` / `rejected`; batch `completed` / `partial` / `rejected`; `sold` always false; live settlement out of scope |
| Tests | `node --test tools/paid-batch-reconciler/test/*.test.mjs` — inherited donor tests are not the CW62 acceptance pack |
| Account prerequisite | Current core `6007fcfa`. PG 55592 only if a test truly needs it. |
| Next integration owner | CW62 |

## Bindings (not blocked on siblings)

| API | How this package consumes it | Later binding |
| --- | --- | --- |
| Current `runPaidOffer` / `classifyFunding` | Request desk → execution.v1 at `6007fcfa` | Runner overrides (`f08Root`, `offerAdapter`) are refused |
| I01 `hashTermsVersion` | Isolated pin from Neo PR54 `819fa637` under `vendor/funded-task-terms/` | keep hasher; do not force ledger termsVersion equal to wrapper receipt hashes |

## Evidence classes

| Class | What counts |
| --- | --- |
| Fixture | reserved-fixture payment JSON, SAMPLE seeded files, labelled 0.02 price |
| Local-runtime | PR52 `runPaidOffer`, `127.0.0.1` HTTP, disposable Postgres 16, CLI `bin/batch.mjs` |
| External acceptance | live x402 settle, facilitator, catalog publication — out of scope |
