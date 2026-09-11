# SOURCE — h04-page-03

Repo: `epistemedeus/samedaydesk`  
Path: `server/lib/spa-route-shells.js` (crawler-readable first-byte HTML for `/x402/verified`)  
Public URL: `https://samedaydesk.com/x402/verified`

| Side | Full SHA | Commit |
| --- | --- | --- |
| before | `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0` | Add build-time /x402/verified inspection feed and page |
| after | `3c96d3137f815035ed4a6467d28c8041916a9aa8` | Constrain verified feed to current owner evidence |

This is a second real page-fact change on a different path from h04-page-01 (SPA route shell vs `client/public/tools/schema-validator.html`). Title and h1 stay put; the buyer-facing description / freshness sentence changes.

## Before (`git show 3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0:server/lib/spa-route-shells.js`)

Route object starting at L103:

```js
    path: "/x402/verified",
    title: "Inspected x402 routes | SameDayDesk",
    description:
      "Build-time inspection list of unpaid 402 terms, last check time, contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree.",
    canonical: `${SITE_ORIGIN}/x402/verified`,
    crawlerHtml: `
      <h1>Inspected routes, not a certificate</h1>
      <p>
        Build-time list of routes from the existing seller-conformance crawl and repair-brief
        registry. Each row records seller, route, unpaid 402 price and network, last check time,
        contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row
        agree. The badge is verified, drift, or unverified.
      </p>
```

## After (`git show 3c96d3137f815035ed4a6467d28c8041916a9aa8:server/lib/spa-route-shells.js`)

```js
    path: "/x402/verified",
    title: "Inspected x402 routes | SameDayDesk",
    description:
      "Build-time inspection list of current SameDayDesk unpaid 402 evidence, including an OpenAPI operation observation and matching fresh CDP Bazaar evidence.",
    canonical: `${SITE_ORIGIN}/x402/verified`,
    crawlerHtml: `
      <h1>Inspected routes, not a certificate</h1>
      <p>
        Build-time list of current SameDayDesk routes from the existing seller-conformance crawl.
        Each row has a live unpaid 402 check and contract hash. It records whether the operation was
        observed in OpenAPI and whether a matching CDP Bazaar row was observed within seven days
        of the crawl. The badge is verified, drift, or unverified.
      </p>
```

Unchanged selected facts: title `Inspected x402 routes | SameDayDesk`; h1 `Inspected routes, not a certificate`.  
Changed selected fact: `description` (and the crawler `<p>` sentence that a buyer would read as the inspection rule).

Honesty: `client/index.html` L183 at both SHAs still describes the list as “whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree.” The page under watch is the `/x402/verified` route shell, not the homepage blurb.

Not reused: W4 SAMPLE RFQ fixtures, `rfq.example` URLs, or “Q3 widget RFQ”.
