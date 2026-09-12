# Vendor Budget Impact

Compare two caller-supplied pricing-row snapshots. The output flags added,
removed, changed and incomparable-unit fields for review. It is a row-diff
tripwire, not a bill calculator, tariff engine, SKU recommender, live quote or
purchase authorization.

## Inputs and invocation

Use Node 22 or newer. Supply both dated snapshots:

```bash
node bin/useful-jobs.mjs run vendor-budget-impact \
  --before ./before.json --after ./after.json --out-dir ./budget-review
```

Each file must be a JSON object with a rows array. Every row requires a non-empty
field string, a finite numeric value, and a non-empty unit string. Missing fields
refuse with input-schema-mismatch; omitted CLI paths refuse with
missing-required-inputs. Output cannot overlap the input files.

```json
{"rows":[{"field":"gpt-3.5-turbo-input","value":0.0005,"unit":"USD/1K-tokens"}]}
```

Keep field identity stable. A replacement model is a different field, not a price
cut to the old model. Source dates, URLs, extraction coverage and whether a price
is effective or announced are the caller's responsibility. The tool does not
fetch or authenticate sources.

## Outputs

budget-impact.json is the machine artifact; budget-impact.md is the matching
human review. Stdout supplies status, digest and outDir.

- review-price-field: fieldKey, beforeValue, afterValue, unit, and numeric delta
  (after minus before, per stated unit) when finite comparable values exist.
- review-added-price-field: fieldKey, afterValue, unit. This means present only
  in the after snapshot. It does not establish a new offering or increased bill.
- review-removed-price-field: fieldKey, beforeValue, unit. This means absent from
  the after snapshot. It does not establish retirement or reduced bill.
- normalize-unit-before-budgeting: beforeUnit and afterUnit, with no numeric
  delta. Units are not converted. Conflicting/unknown evidence stays partial.
- no-budget-delta: no detected row deltas. It does not prove bills are unchanged.

Actions are advisory. purchaseAuthority is always false. scope explicitly marks
billCalculation, liveQuote, unitsConverted and sourceCoverageVerified false.

## What the field evidence supports

The official OpenAI 2023-06-13 and 2024-01-25 announcements supply a historical
same-alias, same-unit GPT-3.5 Turbo comparison: input 0.0015 to 0.0005 and output
0.002 to 0.0015 USD/1K-tokens. These are dated list snapshots, not current prices.

Adding text-embedding-3-small beside ada-002 is an added field, not an ada-002
price cut. Prompt-cache write/read rows are separate from base input/output.
R2 rows appearing on a Workers pricing page establish changed page coverage, not
a new R2 launch. Unchanged Haiku rows support only a no-row-change result.

Sources:
- https://openai.com/index/function-calling-and-other-api-updates/
- https://openai.com/index/new-embedding-models-and-api-updates/
- https://www.anthropic.com/news/claude-3-family
- https://www.anthropic.com/news/prompt-caching
- https://github.com/cloudflare/cloudflare-docs/commit/8a7f8097e3

## Limits and samples

Actual usage, SKU/channel, free allowances, tier thresholds, discounts, cache
behavior, tax, billing periods and all tariff terms are required for a bill
estimate. No usage is assumed here. Any separately supplied hypothetical usage
must be labeled hypothetical, not a customer invoice or measured savings.

```bash
node bin/useful-jobs.mjs run vendor-budget-impact --example
```

--example uses the packaged pricing sample. It is explicitly labeled sample,
not live-market evidence, a customer, independent use or demand.
