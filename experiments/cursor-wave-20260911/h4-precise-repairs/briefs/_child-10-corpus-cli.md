# Child 10 — Corpus runner CLI

Pack: `experiments/cursor-wave-20260911/h4-precise-repairs/`
Branch: `fable/h4r-defect-corpus`
Parent session: `512803b8-c0dc-4a9d-a58f-1ab2d07cc0a3`

Did not write `fixtures/corpus/*.json` (siblings own those). Did not edit `FEATURE-MAP.md`, `RECEIPT.md`, `src/intake.ts`, `src/failures.ts`, `src/constants.ts`, or `src/corpus-types.ts`. Did not implement F08 product.

## Journey

```sh
cd experiments/cursor-wave-20260911/h4-precise-repairs
npm test
node --experimental-strip-types bin/repair.ts corpus --fixtures fixtures/corpus/
```

Also accepts `repair corpus --fixtures <dir>` as argv.

## Behavior

- `loadCorpus(dir)` reads `*.json`, ignores `_` / dotfiles, returns `CorpusFixture[]`.
- Validate: `saleState === "not_a_sale"`, `provenance === "fixture"`, `authorized === false`.
- Dispositions: `reproduced` | `fixed_with_regression` | `briefed_out_of_scope` | `noted` (maps `notes` → `noted`).
- `provenance=customer`, paid/settled, or `saleState` other than `not_a_sale` → `FIXTURE_BECOMES_SALE`, exit 2.
- `authorized: true` → `LIVE_SETTLE_REFUSED`, exit 2. Never settles.
- `evaluateCorpus` always calls `invokeLiveSettle(designCanary())` and reports `canarySettled: false`.
- Missing `REQUIRED_CORPUS_IDS` are listed as `missingIds` (warn). Present valid fixtures still yield `ok: true` / exit 0.

CLI JSON: `{ ok, command:"corpus", results, saleState:"not_a_sale", canarySettled:false }` plus `missingIds` and `rejected`.
