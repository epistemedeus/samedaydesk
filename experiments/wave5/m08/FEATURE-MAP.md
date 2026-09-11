# FEATURE-MAP — W5-M08 independent route consumers

Thin consumer of the pinned Co12 `tools/route-table-diff` CLI. Owns only
`experiments/wave5/m08/`. Does not copy that kernel, edit `spa-route-shells.js`,
or rewrite homepages.

## Claimed supported formats (current pin)

Tested against Co12 `7387eb677abd442dfab9081cb0ad95451fd2a762` (PR 64). M04 may
amend the kernel later; this consumer does not claim that later behavior.

| Format | Example | Command | Tests |
| --- | --- | --- | --- |
| `routes-wrapper` | `{ schema, routes: [{ path, canonical, title, robots? }] }` | `node experiments/wave5/m08/bin/route-consumer.mjs --before <json> --after <json> --out-dir <dir>` | `test/supported-formats.test.mjs` |
| `catalog-wrapper` | `{ catalog: [...] }` accepted by the current pin; Co12 FEATURE-MAP prefers `routes` | same | `test/supported-formats.test.mjs` |
| `raw-array` | JSON array of route records | same | `test/supported-formats.test.mjs` |
| `loopback-http-json` | `http://127.0.0.1` catalogs of those JSON envelopes | same with loopback URLs | `test/local-http.test.mjs` |

Live `SPA_ROUTE_SHELLS` on SDS52 `aeef964f` is an independent supported example.
Co12's copied PUBLIC_SHELLS snapshot is not reused.

## Explicit unsupported formats

| Format | Fixture | Consumer code |
| --- | --- | --- |
| HTML | `fixtures/unsupported/page.html` | `unsupported_format` / `html` |
| YAML | `fixtures/unsupported/routes.yaml` | `unsupported_format` / `yaml` |
| CSV | `fixtures/unsupported/routes.csv` | `unsupported_format` / `csv` |
| Express source | `fixtures/unsupported/express-app.mjs` | `unsupported_format` / `javascript` |
| Next.js page | `fixtures/unsupported/next-page.tsx` | `unsupported_format` / `typescript` |
| FastAPI source | `fixtures/unsupported/fastapi_app.py` | `unsupported_format` / `python` |
| OpenAPI | `fixtures/unsupported/openapi.json` | `unsupported_format` / `openapi` |
| Next.js-shaped JSON | `fixtures/unsupported/next-routes.json` | `unsupported_format` / `nextjs` |
| Express `:param` JSON | `fixtures/unsupported/express-params.json` | `unsupported_format` / `express-path-params` |
| HTTPS catalog | `https://samedaydesk.com/...` | `unsupported_format` / `https-url` |

Co12 at this pin accepts Next.js-shaped `{routes:[{path:"/blog/[slug]", ...}]}`.
This consumer refuses it. That is the smallest owned fix: a format gate, not a
second kernel.

## Analysis vs transport

| `analysis` | Meaning |
| --- | --- |
| `change` | Engine `ok` and added/removed/changed > 0 |
| `no-change` | Engine `ok` and those counts are 0. Valid useful output. |
| `refused` | Valid domain refusal (`duplicate_path`, `integer_terms_version_refused`, `unsupported_format`, …) |
| `engine-failure` | Missing CLI, spawn error, unparseable engine output |

Permutation of the same routes is `no-change` in added/removed/changed. The
current pin's `tableDigest` still changes with order. This consumer reports
`digestOrderSensitive: true` and does not force those hashes equal. Remaining
binding: W5-M04.

Integer `termsVersion` is refused by the engine. This consumer does not map it
onto I01 `hashTermsVersion`.

## Non-claims

`paid: false`, `settled: false`, `purchaseAuthority: false`. No homepage rewrite.
Postgres is not an input. Production `https://samedaydesk.com` fetch is refused.
