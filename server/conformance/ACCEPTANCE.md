# Directory acceptance recipe

Run only the focused suite, not unchanged full suites:

```
node --test server/scripts/test-conformance-directory.js
```

Accept a `/directory` increment only when all of the following hold.

1. Subjects. `/directory/mcp/<org>/<repo>` and `/directory/x402/<host>` (and `badge.svg`) parse locally and never fetch a caller-supplied URL. Invalid subjects, including IP literals, localhost/internal names, traversal, and userinfo, return 404 `invalid_subject`. Unknown valid subjects return 404 `no_public_check`. Inaccessible record files return 503 `inaccessible_records`.
2. Evidence. Scorecards consume existing probe records only. Preserve timestamp, method, incomplete, unknown, failed, and stale states. HTTP 200 alone is not a pass. Registry/initialize version drift, unmarked POST routes, missing OS pass rates, and missing settlement stay incomplete. Failed is never relabeled checked or certified.
3. Badges. Visible text states the actual status (including `stale/partial` when both apply), the check date, and `not a certification`. Title/aria include scope, time, methods, freshness, and completeness. No certification, live payment, or settlement claim the evidence lacks.
4. Catalog. Link 49/100/499 only when those offers are actually available. `agent_first_use_report` stays omitted unless `SDS_AGENT_FIRST_USE_REPORT=1`.
5. Privacy. Public JSON, HTML, and badges expose service facts only; customer rows, secrets, and payment identifiers stay stripped.
6. Release. This path is disjoint from PR 443 and payment source. Sale stays off. Next consumer is the existing SDS review/build path, not a live Hostinger publish.
