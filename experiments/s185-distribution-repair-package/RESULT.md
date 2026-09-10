# S185 RESULT — distribution-repair acquisition package

Branch: `codex/s185-distribution-repair-package-20260910`
Base / recorded head: `b2e833e47fd56b922574aa9fbcebe62af7edcd07` (post-commit) (working tree not merged)
Parent session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`
Model: `grok-4.6` · effort `xhigh`
S176 frozen candidate (not rewritten): `f3d55e54a7b3c548943312443f9f066652d83980`

Final head: `b2e833e47fd56b922574aa9fbcebe62af7edcd07`

## Composed pins

| Module | Pin |
| --- | --- |
| Record04 | `0e703bd4682894df4e1d25c61b594cac49f2463c` |
| Record04 export base | `8b8e44376e9414f540483a526b048beb9e4dc370` |
| Record05 | `a7e2cd7a2223e2aa7e7e09eebf3695aba4731205` |
| DIST08 | `ea000772cdbd6d5df7174369dcef9aa2270e5723` |
| NL06 | `76c0732b241beaa569f05a7394fdbf49604ffb66` |
| First-use (held, boundaries only) | `ea2938cfa68dadbe20a9d5ec096f315e59f4cdbe` |

No second parser. Grexal is not a universal adapter. Production acquisition: **false**.

## Outcome

Caller-supplied listing snapshots + baseline/current route pair → explainable DIST08 diagnosis + NL06/Record04 owner repair guidance.

Exact statuses:

| Case | `status` |
| --- | --- |
| Positive / caller alpha & beta | `diagnosed` |
| Incomplete current capture | `partial` (`cannot_prove_global_removal`) |
| Nonmatching identity | `mismatch` (joinedCount `0`) |
| Incomplete catalog | `incomplete_catalog` |
| Missing record | `missing_record` |
| Forbidden/malformed | `malformed` |
| Missing identity | `unknown` (Grexal not inferred) |
| Repeat after `/docs` fix | `/docs` `redirected` → `unchanged` |

Before/after on the positive pair: `/docs` redirected → `update_listed_route_or_redirect_target`.

## Package

- Owning tree: `experiments/s185-distribution-repair-package/`
- Shared CLI: `bin/distribution-repair.mjs` + importable `src/index.mjs`
- Archive: `client/public/kit/distribution-repair-2b80f38a4e5e.tar.gz`
- sha256: `67903e691958c7680fa2c46f2f53f70eac1ee187a71fa42e527dc2830510a033`
- bytes: `75172`
- Discovery: `client/public/discovery/distribution-repair.json` → `/kit/distribution-repair-2b80f38a4e5e.tar.gz`
- Inner page: `/for-agents/distribution-repair` (homepage identity untouched)

## Verification

- Record05 / Record04 / DIST08 / NL06 pin suites: pass
- S185 acquisition matrix (caller×2, rename, before/after, mismatch, incomplete catalog, missing record, malformed, repeat): pass
- Clean unpack outside repo + caller diagnose: pass
- Archive hygiene: no `/workspace` leaks, secrets, or transcripts
- Client build + route shell `/for-agents/distribution-repair`: pass
- Browser QA desktop 1440: pass
- Browser QA mobile 390: pass
- Browser QA width 320: pass (`mobile.mjs --viewport 320x720`)
- Children: none (parent-only). Peak Heavy concurrency: 1
- Cash $0. No merge/deploy. No live listing mutations or paid invokes

## Cold start

```bash
curl -fsSL -o distribution-repair.tar.gz https://samedaydesk.com/kit/distribution-repair-2b80f38a4e5e.tar.gz
mkdir -p /tmp && tar -xzf distribution-repair.tar.gz -C /tmp
cd /tmp/distribution-repair
node bin/distribution-repair.mjs sample --positive
```

Parent remains resumable for S186 review amendments.
