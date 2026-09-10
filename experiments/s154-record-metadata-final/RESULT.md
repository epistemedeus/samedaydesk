# S154 RESULT — CSV metadata final amend

Cash **$0**. No new review fleet. No merge/deploy. Root-authoritative finding on S147 tip `f9b9701…`; owner reproduced and fixed.

| **amendedHead** |  |

## Timing

| Field | Value |
|---|---|
| Start (UTC) | 2026-09-10T12:03:00Z |
| End (UTC) | 2026-09-10T12:03:57Z |

## Defect (Root-read)

Compare loop skipped every column starting with `__`, so caller header `__status` old→new could stay unchanged. Row meta (`extraFields` / short-row counts) lived in the same object namespace as caller cells and could collide with real headers; `{}` cells mishandled `__proto__`. `parseCsvFile({ columns:false })` still stripped the first row as a header; `relax` was ignored.

## Fix

- Rows are `{ cells: Object.create(null), meta }` — metadata never shares caller header keys.
- All ordinary shared headers are compared (no `__` skip / no magic-name ban).
- Empty vs missing vs null preserved via cell presence.
- Width overflow / short rows reported as `metaChanges`, not fake `__*` columns.
- `columns:false` keeps every record as a data row (no header strip).
- `relax:false` disables `relax_column_count` (uneven widths → parse error).

S147 F1–F6 gates retained.

## Reproduction outcomes (owner CLI)

| Case | Outcome |
|---|---|
| `__status` old→new | keyed `changedCount=1`, field `__status` |
| `__extraFields` header | keyed change on caller column (not meta) |
| `__proto__` | keyed change (null-prototype cells) |
| empty→missing | presence empty≠missing + meta rowWidth |
| ragged wide | `metaChanges.extraFields` |
| duplicate headers | still `duplicate-headers-blocked` |

## Gates

- Node **v22.14.0**, locked deps, **41/41** tests
- `npm run demo:all` exit 0
- CLI summaries: `out/cli-summaries.json`

## Non-claims

- Not a full CSV dialect / type-inference engine
- Chat reviewer did not re-run; this is owner amend of a Root-read source defect
