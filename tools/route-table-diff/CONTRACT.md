# Route-table comparison contract (W5-M04)

Small SDS crawler-shell comparison. Consumers can develop against this export. Wrapper wiring is unbound.

## Entry

```bash
node tools/route-table-diff/bin/route-diff.mjs --before <json> --after <json> --out-dir <dir>
```

Library: `runRouteDiff`, `diffRouteTables`, `classifyRouteDiff`, `tableDigest`, `normalizeRoutePath`, `canonicalIdentity` from `lib/index.mjs`.

Record shape: `{ path, canonical, title, robots? }`. Wrapper `{ schema, routes }` or `{ catalog }`. A raw array is accepted.

## Identity

`tableDigest` is `sha256:` + 64 lowercase hex of `samedaydesk.route-table.digest.v2`. Routes are sorted. Array order is not part of identity.

Path identity URI-decodes and drops a trailing slash. Query, hash, empty, `.`, and `..` segments are invalid.

Canonical identity is http(s) origin plus that pathname. Default ports are stripped by URL parsing. Trailing slash on the pathname is not a different canonical. Query and hash stay distinct. Unlike origins are not forced equal.

Integer `termsVersion` is refused. This job does not import I01 `hashTermsVersion`.

## Outcomes

CLI exit 0 means analysis finished. Exit 2 is a refusal (transport, invalid record, unsupported schema, homepage, SAMPLE-as-published).

| `outcome` | `breaking` | Meaning |
| --- | --- | --- |
| `no-change` | false | Same SDS routes, same order |
| `permutation` | false | Same SDS routes, different array order |
| `title-only` | false | Title edits only |
| `changed` | false | Added routes and/or canonical/robots edits, no removal or collision |
| `breaking` | true | Path/canonical collision after SDS identity, or a removed route |

Collision is an analysis finding (`ok: true`, `breaking: true`), not a missing engine. OpenAPI `paths` maps and method/handler records are `unsupported_catalog` refusals. This job does not invent SDS fields from unlike schemas.

## Evidence

`evidenceClass` is `fixture` | `caller` | `local-runtime`. Public HTTPS catalogs are refused. Postgres is not an input.

`publishedRouteTable` is always false. `paid` is false. `settled` is false. `nonsettling` is true.

## Tested version

Tested at the commit that added this file on branch `cursor/w5-m04-co12-route-table-comparison-faa0`. Starting ref `7387eb677abd442dfab9081cb0ad95451fd2a762`. PR52 wrapper pin `aeef964fa188443078958d9d6d393afae1d542ee` was read only. This engine is not invoked by that wrapper.

## Remaining integration binding

W5-M01. Inject a read-only PUBLIC_SHELLS reader if a live catalog is wanted. Do not edit `spa-route-shells.js`. Do not vendor listing-repair-packet or the earned-work hasher.
