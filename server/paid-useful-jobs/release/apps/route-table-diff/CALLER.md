# route-table-diff - caller guide

Diff two JSON route catalogs `{path, canonical, title, robots?}` and write
`route-diff.json` plus `route-diff.md`. Does not edit spa-route-shells or homepages.

## Required inputs

| Flag | Meaning |
|------|---------|
| `--before` | Before route-table JSON (file or loopback http://127.0.0.1) |
| `--after` | After route-table JSON |
| `--out-dir` | Directory for route-diff.json / route-diff.md |

## `--example` vs caller files

`--example --out-dir DIR` uses packaged SAMPLE catalogs (not the published SDS table).
Caller files: `samples/routes/h04-route-01/{before,after}.json`.

## Honesty

`--published` with SAMPLE is refused. Homepage path `/` rewrite is refused.
OpenAPI path maps and Next.js-shaped records are not claimed formats.
Loopback HTTP is local-runtime, not a public fetch. `purchaseAuthority` is false.
