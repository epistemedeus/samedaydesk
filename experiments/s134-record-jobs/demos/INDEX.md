# S134 demo index (parent / cold consumer)

Cash **$0**. Inputs are local fixtures under `fixtures/` only. No paid fetch, LLM, notifications, remote `$ref` resolve, or marketplace listing.

## Free baseline

A competent free baseline is eyeballing two local OpenAPI, extracted-pricing JSON, CSV, or RSS/Atom files and running ad-hoc `diff` or a spreadsheet. These demos add structured offline parsers with explicit uncertainty; they do not scrape live pages, poll feeds, or claim paid monitoring / API-changelog value.

## Package export

**S127 owns npm marketplace package export and import.** This experiment package is `"private": true` (`@samedaydesk/s134-record-jobs`). The four CLIs stay experiment-local. This index is not an npm publish and does not list a marketplace package.

## Four `demo:*` npm scripts

Working directory: `experiments/s134-record-jobs`. Commands below match `package.json` `scripts`.

| npm script | Underlying command | Local fixtures |
|---|---|---|
| `npm run demo:openapi` | `node modules/openapi-impact/cli.mjs --before fixtures/openapi/positive/before.json --after fixtures/openapi/positive/after.json --used fixtures/openapi/positive/used.json` | used-operation OpenAPI impact (positive) |
| `npm run demo:pricing` | `node modules/pricing-table-change/cli.mjs --before fixtures/pricing/positive/before.json --after fixtures/pricing/positive/after.json` | extracted pricing field/unit change (positive) |
| `npm run demo:csv` | `node modules/csv-drift/cli.mjs --before fixtures/csv/positive/before.csv --after fixtures/csv/positive/after.csv --key sku` | CSV schema/row drift keyed on `sku` (positive) |
| `npm run demo:rss` | `node modules/rss-atom-brief/cli.mjs --before fixtures/rss/positive/before.xml --after fixtures/rss/positive/after.xml` | RSS correction + dedup brief (positive) |

One-shot (`&&` chain of the four scripts above):

```bash
cd experiments/s134-record-jobs
npm run demo:all
```

Each CLI writes JSON to stdout with `paidValueClaim: false` and a `freeBaseline` object. Process exit `0` means the report `ok` field was true. Process exit `2` is missing args or fail-closed parse. JSON labels are not git-apply, acceptance, or paid value.

## Context pins (not invoked by these demos)

- Merchant page-change/record recipes: `epistemedeus/x402-url-extractor@1a23b648` (context only; demos do not wrap merchant HTTP).
- S122 merchant `c0255ac`: unresolved in this checkout.
