# FEATURE-MAP — SPA route-table diff (W4-commerce-12)

Offline job. Reads two caller JSON catalogs and writes `route-diff.json` plus `route-diff.md`. Does not edit `server/lib/spa-route-shells.js`, homepages, or live listings.

## Caller journey

| Goal | Entrypoint | Command | State | Tests |
| --- | --- | --- | --- | --- |
| Diff two route catalogs | `bin/route-diff.mjs` | `node tools/route-table-diff/bin/route-diff.mjs --before <json> --after <json> --out-dir <dir>` | Files under `--out-dir`: added / removed / changed canonical or robots | `test/journey.test.mjs` |
| Labeled SAMPLE run | same | `--example --out-dir <dir>` | `publishedRouteTable: false`, `sample: true`, `evidenceClass: fixture` | `test/seeded-failures.test.mjs` |
| Local HTTP catalogs | same | `--before http://127.0.0.1:<port>/before.json --after http://127.0.0.1:<port>/after.json` | `evidenceClass: local-runtime`. Not external acceptance. | `test/local-http.test.mjs` |

Record shape: `{ path, canonical, title, robots? }`. Wrapper `{ schema, routes: [...] }` is preferred. A raw array is accepted.

`changed` is canonical or robots only. Title-only edits are `titleOnly`.

## Seeded refusals

| Claim | Code | Fixture / flag |
| --- | --- | --- |
| Homepage rewrite | `homepage_rewrite_refused` | `fixtures/failures/homepage-rewrite.json` and `--rewrite-homepage` |
| SAMPLE as published table | `sample_not_published_route_table` | `--published` with `--example`, or `fixtures/failures/sample-as-published.json` |
| Path-less records | `pathless_record` | `fixtures/failures/pathless.json` |
| Integer `termsVersion` | `integer_terms_version_refused` | `fixtures/failures/integer-terms-version.json` |
| Public HTTPS catalog | `external_catalog_refused` | `https://samedaydesk.com/...` |

## Evidence classes

| Class | Meaning |
| --- | --- |
| fixture | Labeled SAMPLE / copied PUBLIC_SHELLS snapshot. Not the published table. |
| caller | Caller files on disk. |
| local-runtime | Loopback `http://127.0.0.1` (or localhost / ::1). Real HTTP in tests. |
| external | Refused. A fixture is not proof of a production server path. |

Postgres is not an input. This job has no catalog store.

## PUBLIC_SHELLS snapshot

`fixtures/public-shells-snapshot.json` copies PUBLIC_SHELLS `path` / `title` / `canonical` from `server/lib/spa-route-shells.js` at `5b97d1b02e786acd1895cfa1508087ae3f7a1545`. Homepage `/` is excluded. Snapshot tests compare against the live module without writing it.

## Digests

`tableDigest` is `sha256:` + 64 lowercase hex of the normalized route list. Format matches I01 / Neo PR54 content-hash `termsVersion`. This module does not import `hashTermsVersion` or the F01 occupancy kernel.

## Later integration (unbound)

| Binding | Owner |
| --- | --- |
| Live PUBLIC_SHELLS export | Inject a reader of `SPA_ROUTE_SHELLS`. Do not edit the generator. |
| `hashTermsVersion` | I01 / Neo PR54 `packs/funded-task-terms` |
| listing-repair-packet | Inject if a caller wants diagnosis after this diff. Do not copy that kernel. |

Root is the next integration owner.

## Non-claims

No payment, deploy, homepage rewrite, shell write, or published-table authority. `paid: false`, `settled: false`, `nonsettling: true`.
