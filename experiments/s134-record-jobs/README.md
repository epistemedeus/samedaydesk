# S134 — offline record-job CLIs

Bounded, original CLIs for **used-operation OpenAPI impact**, **extracted pricing-table field/unit change**, **CSV schema/row drift (with uncertainty)**, and **RSS/Atom correction + dedup brief**.

Cash **$0**. No paid fetch, LLM, notifications, or arbitrary input execution. Inputs are local public/synthetic fixtures only.

## Free baseline vs this deliverable

| Free baseline (competent) | This package adds |
|---|---|
| Manual eyeballing of two OpenAPI/CSV/XML files; ad-hoc `diff` / spreadsheets | Structured used-op scoped OpenAPI impact; field/unit pricing deltas; CSV drift with explicit uncertainty when keys absent/duplicate/partial; RSS/Atom correction+dedup brief |
| Merchant page-change/record recipes (pinned context) for extract JSON | Does **not** replace those recipes; does not npm-export a marketplace package (S127 owns package export/import) |
| Paid monitoring / API changelogs | **No paid value claim** — offline local parsers only |

## Pins (license / API checked)

See `PINS.md`. Parsers: `yaml@2.9.0` (ISC), `csv-parse@7.0.2` (MIT), `fast-xml-parser@5.11.1` (MIT). Merchant context pin `epistemedeus/x402-url-extractor@1a23b648` (MIT) for page-change/record recipes — not vendored into these CLIs.

## Modules

| CLI | Path | Role |
|---|---|---|
| `s134-openapi-impact` | `modules/openapi-impact/cli.mjs` | Before/after OpenAPI; only **used** operations |
| `s134-pricing-table-change` | `modules/pricing-table-change/cli.mjs` | Extracted pricing rows field/unit deltas |
| `s134-csv-drift` | `modules/csv-drift/cli.mjs` | Schema + keyed/unkeyed row drift + uncertainty |
| `s134-rss-atom-brief` | `modules/rss-atom-brief/cli.mjs` | Item correction + dedup brief |

## Run

```bash
cd experiments/s134-record-jobs
npm test
npm run demo:all
```

Case classes under `fixtures/{openapi,pricing,csv,rss}/`: `positive`, `negative`, `empty`, `partial`, `conflicting`, `unknown`.

## Native Heavy cells

24 disjoint prompts in `native-cells/prompts/`. Launcher: `native-cells/scripts/launch-admit.mjs` admits by MemAvailable − 25% reserve and PSI, starts an initial cohort of 9, then +3/+6/+9 while earlier cells still run when headroom allows. Cursor only dispatches/collects; no grandchildren (native catalog: subagent depth max = 1). Concurrent child ceiling from catalog: **unknown** (`subagents_max_concurrent: null`); user-reported 64 unverified here.

## Non-goals

- No deploy / default-branch merge / account actions
- No npm marketplace package work (S127)
- No inventing paid usage, bid funding, or remote fetch success
