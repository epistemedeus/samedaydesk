# RECEIPT — W5-H04 api-routes child

Parent session: `03efef00-6fd3-4435-b2d1-1b32a46661b8`.
Owned path: `experiments/wave5-heavy/h04/examples/api-routes/`.
No commits, no engine rewrites, no W4 fixture copies, no useful-jobs SAMPLE OpenAPI.

## Engines run

| Engine | SHA | Worktree |
| --- | --- | --- |
| w4-route-table-diff | `7387eb677abd442dfab9081cb0ad95451fd2a762` | `/tmp/w5-h04/ro-w4-routes` |
| sds52-api-upgrade-brief | `aeef964fa188443078958d9d6d393afae1d542ee` | `/tmp/w5-h04/ro-sds52` |

Out-dir: `/tmp/w5-h04/h04-child-route-runs/<id>`. Per-example `actual-engine.json` is under this owned tree.

## Three examples

### h04-route-01 — path added (`w4-route-table-diff`)

- Before: `9c50ecbae3110768309c99a1bbaaa92991fc8e4d` (S227)
- After: `abeb54eca9a71abe117898e8fe7de7e55e9d917f` (S260)
- Fact: `PUBLIC_SHELLS` appends `USEFUL_JOBS_SHELL`
  - path `/for-agents/useful-jobs`
  - canonical `https://samedaydesk.com/for-agents/useful-jobs`
  - title `Offline useful jobs for agent callers | SameDayDesk`
  - robots absent
- Observed: `ok`, added=1, removed=0, changed=0, titleOnly=0

### h04-route-02 — used-ops added (`sds52-api-upgrade-brief`)

- Before: `d4fec15d822bed6bdb98b6723bdbfbf88c9e5796`
- After: `8c1c4f706c75868d1556db483deff98d29758073` (S54)
- Fact: Express `server/routes/observatory.js` mounted at `/api/observatory`
  - `GET /api/observatory/sources`
  - `GET /api/observatory/snapshot`
  - `GET /api/observatory/sources/{sourceId}`
- Unchanged pins: `GET /api/health`, `GET /api/market-observations/moltjobs-stats`
- OpenAPI is a caller translation of those method+path facts, not kit SAMPLE inventory/museum YAML
- Observed: `ok`, `status=actionable`, `sold=false`, `sample=false`, `Used-ops delta: +3/~0/-0`, three `consider-adoption` actions

### h04-route-03 — no-change control (`w4-route-table-diff`)

- Before: `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0`
- After: `3c96d3137f815035ed4a6467d28c8041916a9aa8`
- Fact: `/x402/verified` path, canonical `https://samedaydesk.com/x402/verified`, title `Inspected x402 routes | SameDayDesk`, robots absent — identical. Description/crawlerHtml copy changed in the JS module.
- Observed: `ok`, added=0, removed=0, changed=0, titleOnly=0, equal tableDigest `sha256:a207a78c75560b76f736f82785f95f308d69194519cc0dc0276e3fecd31cb56a`

## Failures

None. All three CLI runs exited 0. No homepage rewrite, SAMPLE-as-published, pathless, integer termsVersion, or external HTTPS catalog refusals.

## Compact return

| id | fact | SHAs |
| --- | --- | --- |
| h04-route-01 | add `/for-agents/useful-jobs` canonical `https://samedaydesk.com/for-agents/useful-jobs` | `9c50ecbae3110768309c99a1bbaaa92991fc8e4d` → `abeb54eca9a71abe117898e8fe7de7e55e9d917f` |
| h04-route-02 | add `GET /api/observatory/sources`, `/snapshot`, `/sources/{sourceId}` | `d4fec15d822bed6bdb98b6723bdbfbf88c9e5796` → `8c1c4f706c75868d1556db483deff98d29758073` |
| h04-route-03 | copy-only `/x402/verified`; identity unchanged | `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0` → `3c96d3137f815035ed4a6467d28c8041916a9aa8` |
