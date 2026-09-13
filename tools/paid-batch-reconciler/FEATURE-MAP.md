# Feature map — W4-commerce-08 paid-batch reconciler

| Field | Value |
| --- | --- |
| User goal | Run N fixture-funded useful-job items, get a batch ledger with item-level price/outcome/fundingState, reconcile partial failure, keep sold false. |
| Entrypoint | `tools/paid-batch-reconciler/` (`index.mjs`, `lib/ledger.mjs`) |
| Command | `node tools/paid-batch-reconciler/bin/batch.mjs run <request.json>` |
| Local HTTP | `POST http://127.0.0.1:<port>/batch` via `bin/batch.mjs serve` |
| State | item `unfunded` / `reserved-fixture` / `rejected`; batch `completed` / `partial` / `rejected`; `sold` always false; live settlement out of scope |
| Tests | `node --test tools/paid-batch-reconciler/test/*.test.mjs` (12 pass / 0 fail on this Cloud run with F08 pin + Postgres 16) |
| Account prerequisite | None for the fixture journey. Optional: F08 pin worktree (`F08_PIN_ROOT`), Postgres 16 binaries for the local-runtime persist test. |
| Next integration owner | Root |

## Bindings (not blocked on siblings)

| API | How this package consumes it | Later Root binding |
| --- | --- | --- |
| PR51 useful-jobs 1.0.0 | Spawn `bin/useful-jobs.mjs` from the committed public archive | already on SDS main `5b97d1b0` |
| F08 `runPaidOffer` / CLI | Injected adapter when `F08_PIN_ROOT` points at `bae3e7cd`; not edited | merge of SDS PR52 |
| I01 `hashTermsVersion` | Isolated pin from Neo PR54 `819fa637` under `vendor/funded-task-terms/` | keep hasher; do not import original F01 integer `termsVersion` |

## Evidence classes

| Class | What counts |
| --- | --- |
| Fixture | reserved-fixture payment JSON, SAMPLE seeded files, labelled 0.02 price |
| Local-runtime | spawned useful-jobs CLI, `127.0.0.1` HTTP, disposable Postgres 16 |
| External acceptance | live x402 settle, facilitator, catalog publication — out of scope |
