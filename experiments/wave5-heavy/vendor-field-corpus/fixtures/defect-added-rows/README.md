# Released wrapper omits added SKUs

Exact failing fixture: `../pairs/openai-embedding-3-small-added-20240125/`.

On useful-jobs 1.4.0 `vendor-budget-impact`:

- nested `pricing-row-unit` counts `added: 1` with `added[0].fieldKey = text-embedding-3-small`
- wrapper status is `actionable` because added > 0
- wrapper summary still says `fieldChanges=0 unitChanges=0`
- wrapper action is `no-budget-delta` / "No field/unit deltas in curated rows"

Same shape on `anthropic-sonnet35-prompt-cache-20241217` (added 2) and `cloudflare-workers-r2-classA-added` (added 1).

Do not edit `apps/vendor-budget-impact/cli.mjs` in this branch while paid review is in progress. Smallest proposed patch is `PROPOSED-PATCH.md`.
