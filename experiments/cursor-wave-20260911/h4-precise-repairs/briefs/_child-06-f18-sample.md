# Child 06 — F18-sample

SAMPLE / fixture completion is not customer use.

## Finding

F18 live journeys (Pilot PR 128) recorded SAMPLE as not customer use. H4 already rejects SAMPLE / `--example` / fixture intake promoted to `provenance=customer` or paid/settled via seeded failure `fixture-becomes-sale`.

## Repair (pack-local)

Keep `src/intake.ts` `isFixtureSampleOrExample` + `acceptRepairIntake` and `src/failures.ts` `FIXTURE_BECOMES_SALE` unchanged.

Strengthen in `src/f18-sample.ts`:

- `assertSampleIsNotCustomerUse(draft)` wraps `acceptRepairIntake` / `completeRepair` / `isFixtureSampleOrExample`.
- Extra SAMPLE shapes: `{ label: "SAMPLE" }`, `{ sampleLabel: "SAMPLE" }`, `{ exampleMode: true }`, flags `--example`, `sourceKind: "sample"`.
- Thin extra check: SAMPLE completion cannot flip provenance to customer.
- `strengthenFixtureBecomesSale(draft)` returns the same `FIXTURE_BECOMES_SALE` failure for any SAMPLE/fixture completion claimed as customer use.

Unpromoted SAMPLE completion stays `saleState: "not_a_sale"`. Promoted SAMPLE is rejected. Existing `fixtures/sample-example-intake.json` still fails fixture-becomes-sale. Canary `authorized=false` still must not settle (`invokeLiveSettle`).

## Evaluator

`f18-sample` — corpus id `F18-sample`, disposition `fixed_with_regression`, kind `regression`.

## Out of scope

No sale or paid wrapper. No edits to FEATURE-MAP.md, RECEIPT.md, `src/cli.ts`, `src/constants.ts`, `src/corpus-types.ts`.
