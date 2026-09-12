# Route-table comparison contract (W5-M04 / CW16)

Small offline comparison for SDS crawler-shell catalogs and an explicit,
matcher-proved Express 5 subset. Consumers can develop against this export.
Wrapper wiring is unbound.

## Entry

```bash
node tools/route-table-diff/bin/route-diff.mjs --before <json> --after <json> --out-dir <dir>
```

Library: `runRouteDiff`, `diffRouteTables`, `classifyRouteDiff`, `tableDigest`, `normalizeRoutePath`, `canonicalIdentity` from `lib/index.mjs`.

SDS record shape: `{ path, canonical, title, robots? }`. Wrapper `{ schema,
routes }` or `{ catalog }`. A raw SDS array is accepted.

Express 5 catalogs must be explicit so the tool never guesses framework
semantics:

```json
{
  "schema": "samedaydesk.route-table.express.v1",
  "framework": { "name": "express", "major": 5 },
  "settings": { "caseSensitive": false, "strict": false },
  "routes": [{ "method": "GET", "path": "/users/:id" }]
}
```

The Express subset supports Node HTTP methods plus `ALL`, ASCII literal
segments with escaped reserved literals, whole-segment named parameters, a
final whole-segment named wildcard, and root-inclusive `/{*name}`. Parameter
and wildcard names do not affect matching. Express string-pattern grammar
outside that subset, regex/array routes, missing matcher settings, unknown
frameworks, mixed SDS/framework documents, and comparisons with different
framework settings are refusals, never `no-change`.

## Identity

`tableDigest` is `sha256:` + 64 lowercase hex. SDS uses
`samedaydesk.route-table.digest.v2`; Express uses
`samedaydesk.route-table.express.digest.v1`. Routes are sorted. Array order is
not part of identity.

Path identity URI-decodes and drops a trailing slash. Query, hash, empty, `.`, and `..` segments are invalid.

Canonical identity is http(s) origin plus that pathname. Default ports are stripped by URL parsing. Trailing slash on the pathname is not a different canonical. Query and hash stay distinct. Unlike origins are not forced equal.

Express identity includes method and normalized path matching. With
`caseSensitive: false`, literal case is ignored. With `strict: false`, trailing
slashes on the declared pattern are ignored exactly as Express 5 loosens them.
`GET` also handles `HEAD`; therefore a GET/HEAD overlap reports a `HEAD`
witness. Escaped literals such as `/clock\:noon` remain literal; colon is only
parameter syntax inside the explicit Express parser.

Integer `termsVersion` is refused. This job does not import I01 `hashTermsVersion`.

## Outcomes

CLI exit 0 means analysis finished. Exit 2 is a refusal (transport, invalid record, unsupported schema, homepage, SAMPLE-as-published).

| `outcome` | `breaking` | Meaning |
| --- | --- | --- |
| `no-change` | false | Same normalized routes, same order |
| `permutation` | false | Same normalized routes, different array order |
| `title-only` | false | Title edits only |
| `changed` | false | Added routes and/or canonical/robots edits, no removal or collision |
| `breaking` | true | SDS identity collision, matcher-witnessed Express request collision, or a removed route |

Collision is an analysis finding (`ok: true`, `breaking: true`), not a missing
engine. Each Express collision carries one exact `{method,path}` request that
both records match. OpenAPI `paths` maps and unmarked method/handler records
are `unsupported_catalog` refusals. This job does not invent SDS fields or a
framework marker from unlike schemas.

## Evidence

`evidenceClass` is `fixture` | `caller` | `local-runtime`. Public HTTPS catalogs are refused. Postgres is not an input.

`publishedRouteTable` is always false. `paid` is false. `settled` is false. `nonsettling` is true.

## Original SDS implementation pin

Tested implementation `386b8f9fc4745afdc520d1e650d520280936eb39` on branch `cursor/w5-m04-co12-route-table-comparison-faa0`. Starting ref `7387eb677abd442dfab9081cb0ad95451fd2a762`. PR52 wrapper pin `aeef964fa188443078958d9d6d393afae1d542ee` was read only. This engine is not invoked by that wrapper.

CW16 starts from released-useful-jobs source integration
`b23260e6a2b74452075f73da1631da24d8ae6906`. The exact candidate head and
executed commands are recorded in the job-root `RESULT.md`.

## Remaining integration binding

W5-M01. Inject a read-only PUBLIC_SHELLS reader if a live catalog is wanted. Do not edit `spa-route-shells.js`. Do not vendor listing-repair-packet or the earned-work hasher.
