# E4 maintained-runtime useful-job discovery

Maintained client for the **existing** useful-jobs offer. Failures are explicit.

This pack does **not** add a discovery framework, public schema, catalog
endpoint, or homepage route. It GETs (or reads the committed copies of) the
surfaces SameDayDesk already publishes:

| Surface | Path | Live URL |
|---|---|---|
| Machine discovery | `/discovery/useful-jobs.json` | https://samedaydesk.com/discovery/useful-jobs.json |
| Jobs catalog | `/for-agents/useful-jobs/catalog.json` | https://samedaydesk.com/for-agents/useful-jobs/catalog.json |
| Pointer | `/llms.txt` | https://samedaydesk.com/llms.txt |
| Human page (not rewritten here) | `/for-agents/useful-jobs` | https://samedaydesk.com/for-agents/useful-jobs |

Disjoint from J6 `packs/useful-job-desk/**` and from E3 packs. Write boundary is
this directory only.

## What success is

`ok: true` only when the client names the offer: package `useful-jobs`, schema
`samedaydesk.for-agents.useful-jobs.v1`, non-empty job ids, archive sha256 +
bytes, and matching catalog + llms.txt pointers.

Empty HTTP 200, `{}`, `{ok: true}`, and `{ok: true, jobs: []}` are
`silent_empty_success` (exit 2). A naive `if (res.ok) return success` would
accept those; this client does not.

## Commands

From the repository root, Node 22, no install:

```bash
node packs/e4-maintained-runtime-discovery/bin/discover.mjs --committed
node packs/e4-maintained-runtime-discovery/bin/discover.mjs --live
node packs/e4-maintained-runtime-discovery/bin/discover.mjs --fixture packs/e4-maintained-runtime-discovery/fixtures/silent-empty-success.json
node --test packs/e4-maintained-runtime-discovery/test/*.test.mjs
```

`--committed` reads `client/public/**` (the maintained website's published
files). `--live` GETs the same URLs. `--fixture` is for seeded failures.

Exit 0: offer discovered. Exit 2: explicit failure JSON on stdout.

## Kill / out of scope

- New discovery framework (new schema, new public catalog, new search index)
- Homepage rewrite
- Payment, publish, deploy, SKU/price changes
- Owning J6 desk UI or E3 packs
