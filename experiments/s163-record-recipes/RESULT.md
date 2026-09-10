# S163 RESULT — source-bound record recipe library

## Exact head / pin

| Item | Value |
|---|---|
| Branch | `codex/s163-record-source-recipes-20260910` |
| Scope | `experiments/s163-record-recipes` only |
| S134/S154 pin | `65ce1867f1b4339cc708bfb72a7d9a5942785632` |
| Owning repo | epistemedeus/samedaydesk |
| Cash | $0 |

## Deliverable

Deterministic recipe registry around four S134 parsers with:

- Real primary-source pairs (museum OpenAPI commits, airline-safety CSV commits, Electron Atom double-capture, curated public pricing rows with citations)
- Labeled SYNTHETIC pairs where live feeds showed no-change (Node Atom correction/dedup; CSV keyed/dup demos)
- Input adapters that **refuse** unsupported extraction (HTML pricing) instead of inventing rows
- Literal CLI/import demos + next-run manifests retaining units/coverage/source fields
- Docs/consumers written by six native Heavy cells (`S163-N01..N06`)

**Not duplicated:** Bot Record `native05..08` + capture wrapper; `tools/recurring-job-recipes` page-change recipes; S127 package work.

## Gates

| Gate | Result |
|---|---|
| Node 22 `node --test test/recipes.test.mjs` | **6/6 pass** |
| `node demos/run-all.mjs` | **exit 0** (4 demos) |
| S134 modules unmodified | preserved at pin |

## Native Heavy admission

| Metric | Value |
|---|---|
| `/usage` (reaped one-shot) | **79% used / 21% remaining**, reset `2026-09-10T18:27:00Z` (prior S142: 71% @ 11:36:51Z) |
| Runtime discovered | `grok-4.6` + `xhigh` from `~/.grok/models_cache.json` |
| Useful tasks planned | **6** |
| Useful tasks admitted | **6** |
| Completed | **6** (all exit 0) |
| Rejected / not admitted | padding to 48; any `native05..08`; filler market essays |
| Peak CLI process overlap | **6** |
| Effective mem after 25% reserve at admit | ~6.2–6.5 GiB (~40% of total); PSI avg10=0; disk free ~97% |
| Native session IDs | `01a08b4d-d95b-…`, `…d9d3…`, `…d9ec…`, `…dac8…`, `…db96…`, `…dc14…` (full list in `native-cells/receipts/final.json`) |

48-session operating point **not** pursued: only six distinct useful doc/consumer assignments existed; no filler manufactured.

## Recipe outcomes (compact)

| Recipe | Observation |
|---|---|
| OpenAPI used-ops (museum) | Pinned 5 ops: **changed=0 / unchanged=5** (webhook outside pin) |
| Pricing unit case | **unitChanges=1** (`USD/1M-tokens`→`USD/1M-Tokens`); HTML refused |
| CSV real airline-safety | keyed **changedCount=0** (valid no-change) |
| CSV synthetic keyed/dup | change + blank key; **duplicate-keys-blocked** |
| Electron Atom live | **corrected=0**, unchangedCount=10 |
| Node Atom SYNTHETIC | **corrected≥1**, labeled synthetic |

## Non-claims

No ROI/demand, no paid network in demos, no timers/subscriptions, no marketplace publish, no raw transcript export in product docs.
