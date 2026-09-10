# S163 — source-bound record recipe library

Repeat-job **recipes** around the four S134 parsers pinned at
`65ce1867f1b4339cc708bfb72a7d9a5942785632`. Scope: `experiments/s163-record-recipes` only.

Cash **$0**. No timers, subscriptions, paid calls, accounts, outbound messages, site deploy, or marketplace publish.

## Not duplicated

| Existing | Why out of scope here |
|---|---|
| `tools/recurring-job-recipes` | Page-change / buyer-setup contracts |
| S127 package export/import | Different experiment |
| Bot Record `native05..08` + capture wrapper | Owned elsewhere — do not fork |
| Merchant page-change extract recipes | Different input contract |

## Families → S134 parsers

| Family | Parser | Primary real source | Synthetic (labeled) |
|---|---|---|---|
| OpenAPI used-ops | `s134-openapi-impact` | Redocly museum OpenAPI two commits | — |
| Pricing row/unit | `s134-pricing-table-change` | Curated public model-row JSON (citations in SOURCE) | HTML refuse fixture |
| CSV keyed drift | `s134-csv-drift` | FiveThirtyEight airline-safety two commits | keyed change + dup identity |
| RSS/Atom brief | `s134-rss-atom-brief` | Electron `releases.atom` double-capture | Node Atom correction/dedup |

Observed **no-change** on a real pair is a valid outcome. Synthetic pairs are labeled in `SYNTHETIC.json` / filenames.

## Run

```bash
cd experiments/s163-record-recipes
node --test test/recipes.test.mjs
node demos/run-all.mjs
```

Literal CLI examples live in each `recipes/**/R-*.json` (`cliExample`) and demos.

## Adapters

Input prep **refuses** unsupported extraction (e.g. HTML pricing pages) instead of inventing rows. Units/coverage/source metadata are retained into next-run manifests under `next-run/`.

## Native Heavy

Admission uses local model discovery (`grok-4.6` + `xhigh` from `~/.grok/models_cache.json`). Cell IDs are `S163-N##` — **not** `native05..08`. Useful set size is the number of distinct recipe/doc/consumer tasks; no quota filler toward 48.
