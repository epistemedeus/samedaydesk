# h04-route-01 — useful-jobs public SPA path added

Caller-owned route catalogs extracted from `SPA_ROUTE_SHELLS` (bounded JSON, not the JS module). Not copied from `tools/route-table-diff/fixtures/*`. Homepage `/` is excluded.

## SHAs

| Role | Full SHA | Subject |
| --- | --- | --- |
| before | `9c50ecbae3110768309c99a1bbaaa92991fc8e4d` | S227: public consumer evidence acquisition journey |
| after | `abeb54eca9a71abe117898e8fe7de7e55e9d917f` | S260: public useful-jobs surface for SameDayDesk agents |

Repo: `epistemedeus/samedaydesk`. Prove with `git show <sha>:server/lib/spa-route-shells.js` and `git show <sha>:client/src/data/machineEntry.mjs`.

## Before — no useful-jobs shell

`git show 9c50ecbae3110768309c99a1bbaaa92991fc8e4d:server/lib/spa-route-shells.js`

Import has no `USEFUL_JOBS_SHELL`. `PUBLIC_SHELLS` ends at consumer-repeat, then `/terms` and `/privacy`. Canonical is always `` `${SITE_ORIGIN}${route.path}` `` with `SITE_ORIGIN = "https://samedaydesk.com"`.

```js
import { CONSUMER_REPEAT_SHELL, DISTRIBUTION_REPAIR_SHELL, FOR_AGENTS_SHELL, RECORD_REPEAT_SHELL, X402_SHELL } from "../../client/src/data/machineEntry.mjs";
export const SITE_ORIGIN = "https://samedaydesk.com";
const PUBLIC_SHELLS = [
  { path: FOR_AGENTS_SHELL.path, title: FOR_AGENTS_SHELL.title, /* ... */ },
  { path: RECORD_REPEAT_SHELL.path, title: RECORD_REPEAT_SHELL.title, /* ... */ },
  { path: DISTRIBUTION_REPAIR_SHELL.path, title: DISTRIBUTION_REPAIR_SHELL.title, /* ... */ },
  { path: CONSUMER_REPEAT_SHELL.path, title: CONSUMER_REPEAT_SHELL.title, /* ... */ },
  { path: "/terms", title: "Terms of Service | SameDayDesk", /* ... */ },
  { path: "/privacy", title: "Privacy Policy | SameDayDesk", /* ... */ },
].map((route) => ({ ...route, canonical: `${SITE_ORIGIN}${route.path}` }));
```

`git show 9c50ecbae3110768309c99a1bbaaa92991fc8e4d:client/src/data/machineEntry.mjs` has no `USEFUL_JOBS_PATH`.

## After — path + canonical added

`git show abeb54eca9a71abe117898e8fe7de7e55e9d917f:server/lib/spa-route-shells.js`

```js
import { CONSUMER_REPEAT_SHELL, DISTRIBUTION_REPAIR_SHELL, FOR_AGENTS_SHELL, RECORD_REPEAT_SHELL, USEFUL_JOBS_SHELL, X402_SHELL } from "../../client/src/data/machineEntry.mjs";
export const SITE_ORIGIN = "https://samedaydesk.com";
// PUBLIC_SHELLS gains:
  {
    path: USEFUL_JOBS_SHELL.path,
    title: USEFUL_JOBS_SHELL.title,
    description: USEFUL_JOBS_SHELL.description,
    crawlerHtml: USEFUL_JOBS_SHELL.crawlerHtml,
  },
].map((route) => ({ ...route, canonical: `${SITE_ORIGIN}${route.path}` }));
```

`git show abeb54eca9a71abe117898e8fe7de7e55e9d917f:client/src/data/machineEntry.mjs` (lines 9, 560–564, 696–699):

```js
export const SITE_ORIGIN = "https://samedaydesk.com";
export const USEFUL_JOBS_PATH = "/for-agents/useful-jobs";
export const USEFUL_JOBS_TITLE = "Offline useful jobs for agent callers | SameDayDesk";
export const USEFUL_JOBS_CANONICAL = `${SITE_ORIGIN}${USEFUL_JOBS_PATH}`;
export const USEFUL_JOBS_SHELL = Object.freeze({
  path: USEFUL_JOBS_PATH,
  title: USEFUL_JOBS_TITLE,
  canonical: USEFUL_JOBS_CANONICAL,
  /* ... */
});
```

Resolved fact:

| Field | Value |
| --- | --- |
| path | `/for-agents/useful-jobs` |
| canonical | `https://samedaydesk.com/for-agents/useful-jobs` |
| title | `Offline useful jobs for agent callers \| SameDayDesk` |
| robots | absent (null) |

## Unchanged identity

All other `SPA_ROUTE_SHELLS` paths, titles, canonicals, and account `robots: "noindex,follow"` are identical across the two SHAs. Homepage `/` is not in this catalog (`homepage_rewrite_refused`).
