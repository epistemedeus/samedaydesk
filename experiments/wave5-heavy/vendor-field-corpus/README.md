# Vendor-budget-impact field corpus

Does the **released** useful-jobs 1.4.0 `vendor-budget-impact` CLI give a useful
agent/operator decision on genuine vendor list-price moves, and when can it not?

This is not a new comparison engine and not a merchant-cost study. Proof runs
the 1.4.0 archive CLI after verifying sha256
`2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.

## Qualification example (use this shape)

`fixtures/pairs/openai-gpt35-turbo-20230613-20240125/`

Two official OpenAI posts, same field names, same unit `USD/1K-tokens`, explicit
dollars on both dates. That is the narrow input this job can actually scan.

## Pairs

| Id | Structure | Engine | Independent arithmetic | Downstream decision |
| --- | --- | --- | --- | --- |
| openai-gpt35-turbo-20230613-20240125 | USD/1K-tokens | actionable, 2 fieldChanges | input -0.0010, output -0.0005 | Reopen a GPT-3.5 Turbo **list** budget. Magnitudes are not in the artifact; read the rows. Hypothetical 10M in / 2M out is $19 to $8, **not a bill**. |
| openai-embedding-3-small-added-20240125 | USD/1K-tokens | actionable, added=1, action `no-budget-delta` | new SKU 0.00002 vs ada 0.0001 | Should consider switching embedding SKU. Released wrapper currently says no delta. |
| anthropic-sonnet35-prompt-cache-20241217 | USD/MTok | actionable, added=2, action `no-budget-delta` | cache write 3.75 = 1.25*3, read 0.30 = 0.10*3 | Long static prompts may use cache. Wrapper omits the new fields. |
| cloudflare-workers-r2-classA-added | USD/million-requests | actionable, added=1, action `no-budget-delta` | R2 Class A $4.50 / million (standard) | Second tariff shape. Included free operations are not rows. Wrapper omits the add. |
| anthropic-haiku3-unchanged-20240304-20241217 | USD/MTok | informational | none | No Haiku 3 base list move in this window. Do not rebudget from this pair. |
| control-unit-label-unconverted | mixed units | partial, unitChanges=1 | n/a | Correct refusal: do not compare 0.0005 /1K with an unconverted /1M label. |

## Top 3 offer/input/doc changes

1. Surface `added` / `removed` (and numeric before/after) in wrapper actions. See `fixtures/defect-added-rows/`.
2. Publish the GPT-3.5 pair as the caller qualification example: two dated official snapshots, same field+unit.
3. State in CALLER.md that included allowances, batch, cache-hit rate, and usage receipts are out of band.

## Unusable

See `fixtures/unusable/README.md` (Gemini percent-only cut; 2027 scheduled prices; mixing ada-002 with 3-small as one field).
