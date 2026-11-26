# Directory acceptance recipe

Run only the focused suite, not unchanged full suites:

```
node --test server/scripts/test-conformance-directory.js
```

Accept a `/directory` increment only when all of the following hold.

1. Subjects. `/directory/mcp/<org>/<repo>` and `/directory/x402/<host>` (and `badge.svg`) parse locally and never fetch a caller-supplied URL. Invalid subjects, including IP literals and URL-canonicalized IPv4 alternatives (`127.1`, `0x7f.0.0.1`), localhost/internal names (`localhost.localdomain`, `metadata.google.com`), leftover authority, traversal including raw encoded `%2e%2e` paths, mid-string `..` MCP ids, and oversized names, return 404 `invalid_subject`. Unknown valid subjects return 404 `no_public_check`. Inaccessible record files return 503 `inaccessible_records`. Parseable empty probe files yield an empty directory and must not invent SameDayDesk subjects. `listDirectory` and GitHub/origin ingestion use the same validators; a `github.com` path match on another host is not a repo.
2. Evidence. Scorecards consume existing probe records only. Preserve timestamp, method, incomplete, unknown, failed, and stale states. HTTP 200 alone is not a pass. Registry/initialize version drift, unmarked POST routes, missing OS pass rates, and missing settlement stay incomplete. Failed is never relabeled checked or certified. Scope is derived from observations actually present. Apex source-declared MCP versions are not copied onto `epistemedeus/x402-url-extractor`.
3. Versions. HTML, JSON, and visible badge text name the observed MCP `protocolVersion` or `x402Version` when present. Later official MCP revisions, including current `2026-07-28` as retrieved 2026-11-26T12:48:26Z, are marked unclaimed. Registry `$schema` may be shown as a listing document schema and is not a protocol version. First-party well-known path spellings `/.well-known/x402.json` and `/.well-known/x402` are both preserved when records disagree; they are not silently equated.
4. Badges. Visible text states the actual status (including `stale/partial` and `failed/stale/partial` when those facts combine), the checked scope or observed version, the check date, and `not a certification`. Title/aria include scope, time, methods, freshness, and completeness. Index rows and image `alt` use the same honest label. Untransmitted POST routes keep their stored `registryStatus` and are annotated `schema unmarked` at display time. No certification, live payment, or settlement claim the evidence lacks.
5. Catalog. Link 49/100/499 only when those offers are actually available. `agent_first_use_report` stays omitted unless `SDS_AGENT_FIRST_USE_REPORT=1`.
6. Privacy. Public JSON, HTML, and badges expose service facts only; customer rows, secrets, and payment identifiers stay stripped, including camelCase keys such as `customerId` and `paymentIntent`. JSON and SVG responses send `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`. HTML also allows `img-src 'self'`.
7. Release. This path is disjoint from PR 443 and payment source. Sale stays off. Next consumer is the existing SDS review/build path, not a live Hostinger publish.
