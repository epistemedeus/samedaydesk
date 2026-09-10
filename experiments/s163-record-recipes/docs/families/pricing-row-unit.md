# Pricing row/unit family

Family id `pricing-row-unit`. Parser: `s134-pricing-table-change` at S134 pin `65ce1867f1b4339cc708bfb72a7d9a5942785632`. Adapter: `adapters/pricing-row-unit.mjs` (`preparePricingTable`). Recipes: `R-PRICE-UNIT-CASE`, `R-PRICE-REFUSE-HTML`.

Cash **$0**. Adapter output sets `paidValueClaim: false` and `costClaim: false`. The family reports field/unit **string** deltas over already-extracted rows. It does not scrape live pages, convert units, invent prices, or assert catalog/SKU truth.

## Curated public model-row sources (not HTML scrape)

Primary tree: `sources/pricing/public-model-rows/`.

**Citations live in** `sources/pricing/public-model-rows/SOURCE.json` (`citations[]`). They name the public docs the curated rows were drawn from. They are **not** fetch URLs for this recipe and must not be scraped at run time.

Current citations:

- `https://openai.com/api/pricing/`
- `https://docs.x.ai/docs/models`

`SOURCE.json` also records:

| Field | Meaning |
|---|---|
| `extraction` | `curated-json-not-html-scrape` |
| `adapterPolicy` | refuse HTML/PDF; require pre-extracted `{field,value,unit}` rows |
| `synthetic` | `false` for the JSON pairs |
| `pairs` | `before.json` vs `after-identical.json` (no unit change); vs `after-unit-case.json` (case-sensitive unit change) |

Rows are hand-curated JSON snapshots, not a live HTML scrape of those URLs. Numeric literals (`2.0`, `3.0`, `8.0`, `15.0`) are local labels, not live list prices.

Accepted input shape (adapter + parser):

```json
{
  "rows": [
    { "field": "grok-4.6-input", "value": 3.0, "unit": "USD/1M-tokens" }
  ]
}
```

A `{items:[...]}` object or a bare array of row objects is also accepted. Optional `citations` on the JSON object are retained when present; they do not authorize a fetch.

`unsupported-page.html` is a labeled refuse fixture, not a source capture. Do not paste a pricing page into the parser.

## Unit strings must not case-fold

`R-PRICE-UNIT-CASE` diffs `before.json` vs `after-unit-case.json`.

On field `grok-4.6-input` the numeric value stays `3.0` and the unit string changes:

| Capture | Unit |
|---|---|
| before | `USD/1M-tokens` |
| after | `USD/1M-Tokens` |

`s134-pricing-table-change` trims unit strings and compares them as-is. It does **not** case-fold or alias units. `USD/1M-tokens` and `USD/1M-Tokens` are distinct. The adapter keeps `unit` verbatim (`retainUnits: true`).

Field keys are normalized for matching (`trim`, lower-case, whitespace → `_`). **Units are not.**

Expected report (`fixtures/expected/pricing-unit-case.json`):

- `counts.unitChanges` = `1`
- `unitChanges[0].fieldKey` = `grok-4.6-input`
- `numericComparison` = `not-applicable-across-units`
- `conflicting` reason `cross-unit-incomparable` (numeric values are not compared across units)
- `counts.fieldChanges` = `0`

Literal CLI (cwd `experiments/s163-record-recipes`):

```bash
node ../s134-record-jobs/modules/pricing-table-change/cli.mjs \
  --before sources/pricing/public-model-rows/before.json \
  --after sources/pricing/public-model-rows/after-unit-case.json
```

A unit-string change is not a price increase, decrease, or currency conversion.

## Adapter refuse of `unsupported-page.html`

`preparePricingTable` detects HTML (`<!doctype`, `<html`, or a leading `<` with `<body`) and **refuses** instead of synthesizing rows.

Recipe `R-PRICE-REFUSE-HTML` points at `sources/pricing/public-model-rows/unsupported-page.html`.

Expected:

```json
{
  "ok": false,
  "refused": true,
  "code": "unsupported-html-extraction",
  "paidValueClaim": false
}
```

The adapter must not invent `{field,value,unit}` rows from that HTML. Runnable sample: `docs/consumers/pricing-refuse-example.mjs`.

```bash
node docs/consumers/pricing-refuse-example.mjs
```

Other refuse codes include `unsupported-pricing-format`, `unsupported-pricing-shape`, `empty-pricing-rows`, `invalid-unit-type`, `missing-required-fields`, and `null-pricing-input`.

## Non-claims

Explicitly **not** claimed by this family, its recipes, adapter, or demos:

- **No total-cost.** Row values are not multiplied by usage, volume, or seats.
- **No ROI.** Unit or field deltas are not investment returns.
- **No demand.** Presence, absence, or change of a row is not market demand.
- **No live catalog / SKU truth.** Citations identify public docs; rows are curated snapshots.
- **No currency conversion** and **no unit equivalence table.** Cross-unit numerics are incomparable.
- **No paid-value claim.** `paidValueClaim: false`, `costClaim: false`, cash boundary $0.

Registry `nonGoals` includes `invented ROI/demand`. Merchant page-change extract recipes are a different contract and are not invoked here.
