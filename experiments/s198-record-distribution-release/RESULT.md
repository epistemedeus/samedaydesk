# S198 RESULT — record-repeat + distribution-repair candidate

Parent session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`  
Model: `grok-4.6` · effort `xhigh`  
Branch: `codex/s198-record-distribution-release-20260910`  
Composition commit: `339ebf7576aa1a40765b6a2d45bcda8ed46c51d0`  
Integration HEAD: `edd53f69543bf482c77f876f47453f9a55defbbe`  
Base main: `2b80f38a4e5ec5f080d1764de7c539af63190012` (Pulse sources untouched)

| Pin | SHA |
| --- | --- |
| S189 record-repeat tip | `f830b55bc6f9b31f664394341f33c5e43a2a2cf8` |
| S189 substantive repair | `12d528cdd92ae062d60ecd1beff2c9b5639417d7` |
| S176 candidate | `f3d55e54a7b3c548943312443f9f066652d83980` |
| S185 distribution-repair (frozen) | `c05522364b26db04b4aa63f945ad15810785efb4` |
| Parser | `65ce1867f1b4339cc708bfb72a7d9a5942785632` |
| Recipes | `a022eb6352156dcdcdf2f8730931f5891bd01436` |

Production acquisition: **false**. Cash $0. No merge/deploy.

## Integration repairs (no parser rewrite)

Mechanical merge defects only:

1. `machineEntry.mjs` distribution-repair `.join("\\n")` was split into a real newline (SyntaxError).
2. `DECLARED_REACT_ROUTES` omitted `/for-agents/distribution-repair` while App/fallback/shells included it.
3. Browser tests asserted `page.ok` (field never set). Now both inner pages are present by id/h1; overflow layout flags on record-repeat.

Archives **not** rebuilt: public kit bytes already equal packed S189/S185 receipts.

## Focused gates

| Suite | Result |
| --- | --- |
| s134 | 42/42 |
| s163 | 6/6 |
| s176 package | 25 pass, 1 skip (no `dist/` in tree; public kit used) |
| s185 package | 17/17 |
| S198 caller both kits | 2/2 |
| spa-fallback | 2/2 |
| spa-route-shells | 11/11 |
| hosted-startup | 4/4 |
| for-agents overflow | pass |
| client build | pass; shells for both inner pages |

Caller-authored (not fixture `ok:true` counts):

- Record-repeat: pricing 3→4 USD/1M-tokens; CSV `id=1` one changed row; repeat `--from-next-run` with after 4→5; `observedAt: unknown`.
- Distribution-repair: caller alpha `/docs` redirected vs caller beta `/api/v1`; next-run after docs fix `/docs` → `unchanged`. Incomplete catalog still cannot prove global removal (S185 suite).

## Owning-site / viewport

| Gate | Result |
| --- | --- |
| Browser desktop 1440 | pass (both inner pages) |
| Browser mobile 390 | pass |
| Browser width 320 | pass (`mobile.mjs --viewport 320x720`, failures `[]`) |
| Presence | 25 pass, 1 skip |
| Result-reuse | 23/23 |
| Pulse durable + S125 replay | pass (44/46 of `test:pulse`) |
| Pulse events | **env skip**: Node ESM `.ts` import of `sellerRepairBriefs.ts` (unchanged Pulse file; not an S198 edit) |
| Pulse real PG17 | **env skip**: missing `/usr/lib/postgresql/17/bin/initdb` |
| Recurring recipes | 85/89; 4 fail `Cannot find module 'express'` under `/tmp/merchant-input` (env, not SPA catalog) |
| Homepage / Pulse source | no diff vs `2b80f38` except spa-fallback/shells route list |

320 evidence dir (Cursor collect): last run under `/tmp` from `tools/browser-smoke/mobile.mjs --viewport 320x720`.

## Archives (generate-once; not rebuilt)

| Kit | File | sha256 | bytes |
| --- | --- | --- | --- |
| record-repeat | `/kit/record-repeat-job-f3d55e54a7b3.tar.gz` | `f4669fd20660b19fc4d7f6714b63f02cee217973fbc700484b6cc7ceb3f94eef` | 1253839 |
| distribution-repair | `/kit/distribution-repair-2b80f38a4e5e.tar.gz` | `67903e691958c7680fa2c46f2f53f70eac1ee187a71fa42e527dc2830510a033` | 75172 |

Discovery JSON and `machineEntry` / `distributionRepairKit.json` literals match those receipts. Clean unpack: `node bin/record-repeat.mjs list` and `node bin/distribution-repair.mjs schema` succeed with no checkout `npm ci`.

## Remaining limit

Pulse PG17 and merchant-input `express` resolution are environment gaps on this VM, not product-kit defects. Observation time stays unknown unless a digest matches. No production acquisition claim.
