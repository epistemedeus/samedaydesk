# SOURCE — h04-ap-page-stale

Repo: `epistemedeus/samedaydesk`  
Path: `server/lib/spa-route-shells.js` `/terms`  
Public URL: `https://samedaydesk.com/terms`  
Selected fields: `title`, `description`, `headings`.

Public `/terms` title, description, and h1 are **identical** since the shell was added at `1caa18e3e25aac98985afa0d7ffdad1b4121042e`. The useful output is **freshness of the held after-observation**, not a selected-field change and not a live download.

| Input | Value |
| --- | --- |
| clock | `2026-09-12T12:00:00.000Z` |
| `--max-stale-ms` / `job.limits.maxStaleMs` | `1000` |
| after `provenance.completedAt` | `2026-01-01T00:00:01.000Z` |
| age vs clock | ~254 days ≫ 1000 ms |

Engine `observationFreshness` compares the latest source `completedAt` to the required clock. When `ageMs > maxStaleMs`, `freshness=stale` and `current=false`. `claims.fresh` is **hard-false** in this job (it never re-fetches). Expected outcome is **analysis** (`verdict=unchanged`, `freshness=stale`), not a crash, not `live_fetch_url`, not a fresh-download claim.

## Public selected facts (`git show 1caa18e3e25aac98985afa0d7ffdad1b4121042e:server/lib/spa-route-shells.js`)

```js
    path: "/terms",
    title: "Terms of Service | SameDayDesk",
    description: "Read the terms that govern use of the SameDayDesk website and services.",
    crawlerHtml: "<h1>Terms of Service</h1><p>Terms for use of the SameDayDesk website and services.</p>",
```

Same strings at HEAD. Wrapper `completedAt` values are synthetic observation metadata so the stale horizon fires; they are not page-content freshness and not a live GET.

Expected: **analysis**, `verdict=unchanged`, `freshness=stale`, `claims.fresh=false`, `claims.current=false`. `usefulNoChange`: **true**.
