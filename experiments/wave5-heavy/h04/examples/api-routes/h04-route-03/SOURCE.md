# h04-route-03 — copy-only /x402/verified (no-change control)

Caller-owned catalogs extracted from `SPA_ROUTE_SHELLS` at two SHAs. Path, canonical, title, and robots are identical. The JS module still changed description/crawlerHtml copy. Homepage `/` excluded.

This is a meaningful no-change control for W4 route-table-diff: `changed` is canonical or robots only; title-only is `titleOnly`; copy-only is neither.

## SHAs

| Role | Full SHA | Subject |
| --- | --- | --- |
| before | `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0` | Add build-time /x402/verified inspection feed and page |
| after | `3c96d3137f815035ed4a6467d28c8041916a9aa8` | Constrain verified feed to current owner evidence |

Repo: `epistemedeus/samedaydesk`. Prove with `git show <sha>:server/lib/spa-route-shells.js` and `git diff <before> <after> -- server/lib/spa-route-shells.js`.

## Unchanged identity (both SHAs)

```js
path: "/x402/verified",
title: "Inspected x402 routes | SameDayDesk",
canonical: `${SITE_ORIGIN}/x402/verified`,
```

`SITE_ORIGIN = "https://samedaydesk.com"` → canonical `https://samedaydesk.com/x402/verified`. No `robots` field on this shell.

The rest of `SPA_ROUTE_SHELLS` (x402, seller-conformance, ai-readiness, PUBLIC_SHELLS `/for-agents` `/terms` `/privacy`, ACCOUNT_SHELLS with `robots: "noindex,follow"`) is byte-identical for path/title/canonical/robots.

## Copy that changed (must not be a route break)

`git diff 3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0 3c96d3137f815035ed4a6467d28c8041916a9aa8 -- server/lib/spa-route-shells.js`

```diff
     path: "/x402/verified",
     title: "Inspected x402 routes | SameDayDesk",
     description:
-      "Build-time inspection list of unpaid 402 terms, last check time, contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree.",
+      "Build-time inspection list of current SameDayDesk unpaid 402 evidence, including an OpenAPI operation observation and matching fresh CDP Bazaar evidence.",
     canonical: `${SITE_ORIGIN}/x402/verified`,
     crawlerHtml: `
       <h1>Inspected routes, not a certificate</h1>
       <p>
-        Build-time list of routes from the existing seller-conformance crawl and repair-brief
-        registry. Each row records seller, route, unpaid 402 price and network, last check time,
-        contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row
-        agree. The badge is verified, drift, or unverified.
+        Build-time list of current SameDayDesk routes from the existing seller-conformance crawl.
+        Each row has a live unpaid 402 check and contract hash. It records whether the operation was
+        observed in OpenAPI and whether a matching CDP Bazaar row was observed within seven days
+        of the crawl. The badge is verified, drift, or unverified.
```

`git diff --stat` on this file: `10 +++++-----` (description + one crawler paragraph). No path, canonical, title, or robots line changed.

## Expected engine behavior

| Bucket | Count |
| --- | --- |
| added | 0 |
| removed | 0 |
| changed (canonical or robots) | 0 |
| titleOnly | 0 |

Table digests before and after must match because the catalogs are identical identity records.
