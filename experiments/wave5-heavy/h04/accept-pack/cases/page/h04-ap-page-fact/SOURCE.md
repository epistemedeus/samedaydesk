# SOURCE — h04-ap-page-fact

Repo: `epistemedeus/samedaydesk`  
Public URL: `https://samedaydesk.com/for-agents`  
Selected fields: `title`, `description`, `headings` (h1 and h2).

This is a **real public copy change** on a different path from h04-page-01 (`/tools/schema-validator.html` rename) and h04-page-03 (`/x402/verified` 7-day CDP Bazaar sentence). Not W4 SAMPLE RFQ fixtures, not `rfq.example`.

| Side | Full SHA | Commit | Path |
| --- | --- | --- | --- |
| before | `3c96d3137f815035ed4a6467d28c8041916a9aa8` | Constrain verified feed to current owner evidence | `server/lib/spa-route-shells.js` `/for-agents` |
| after | `b663e53771a325d439f24a2a2ccdc94e5250a352` | S214: compose product-only record/distribution release on main | `client/src/data/machineEntry.mjs` `FOR_AGENTS_*` (consumed by `spa-route-shells.js`) |

The extract-batch JSON is a caller-owned `samedaydesk.extract-batch.v0` wrapper. Selected `title` / `description` / `headings` match the cited HTML/shell strings. Wrapper provenance times are not a live re-fetch. `claims.fresh` must stay false.

## Before (`git show 3c96d3137f815035ed4a6467d28c8041916a9aa8:server/lib/spa-route-shells.js`)

```js
    path: "/for-agents",
    title: "Agent payment infrastructure | SameDayDesk",
    description: "Connect agents to SameDayDesk machine services through documented x402, MPP, MCP, and HTTP interfaces.",
    crawlerHtml: "<h1>SameDayDesk interfaces for agents</h1><p>Discover the live machine catalog, inspect payment requirements, and call documented services through the agent gateway.</p>",
```

## After (`git show b663e53771a325d439f24a2a2ccdc94e5250a352:client/src/data/machineEntry.mjs`)

```js
export const FOR_AGENTS_TITLE = "Practical agent jobs | SameDayDesk";
export const FOR_AGENTS_DESCRIPTION =
  "Obtain bounded observations, compare or record already-held JSON, then optionally export a reuse reference. Schema-valid export is user-selected unverified evidence. Purchasing never requires publishing.";
```

Crawler HTML at the same SHA:

```html
<h1>Obtain observations, use offline jobs, or opt-in reuse</h1>
...
<h2>Job 1. Obtain bounded extracted observations</h2>
<h2>Job 2. Compare explicit fields from two already-held observations</h2>
<h2>Job 3. Map already-held JSON into buyer records</h2>
<h2>Job 4. Opt-in reuse of an already produced result</h2>
<h2>Job 5. Recurring page, issue, and buyer-setup recipes</h2>
<h2>Live merchant inventory</h2>
```

Decoded selected facts:

| Field | Before | After |
| --- | --- | --- |
| title | Agent payment infrastructure \| SameDayDesk | Practical agent jobs \| SameDayDesk |
| description | Connect agents to SameDayDesk machine services through documented x402, MPP, MCP, and HTTP interfaces. | Obtain bounded observations, compare or record already-held JSON, then optionally export a reuse reference. Schema-valid export is user-selected unverified evidence. Purchasing never requires publishing. |
| h1 | SameDayDesk interfaces for agents | Obtain observations, use offline jobs, or opt-in reuse |
| h2 | (absent) | Job 1…Job 5 and Live merchant inventory |

Unselected `data.text` also changes (crawler lead). Job fields are only `title`, `description`, `headings`. Expected verdict: **changed**. `claims.fresh`: **false**.
