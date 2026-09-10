# S198 RESULT — record-repeat + distribution-repair candidate

Parent session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`  
Model: `grok-4.6` · effort `xhigh`  
Branch: `codex/s198-record-distribution-release-20260910`  
Composition commit: `260e2443884352adf6c8e7ad9d33b2141bb5cd7d`  
Merge-repair commit: `8d0401d40c5d2ec3695a964f873b8b88389bf3a4`  
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

1. `machineEntry.mjs` distribution-repair command block had a broken newline join (SyntaxError).
2. SPA declared-route catalog omitted `/for-agents/distribution-repair` while App/fallback/shells included it.
3. Browser smokes asserted a nonexistent `page.ok`; both inner pages now asserted by id/h1.

Archives not rebuilt: public kit bytes already match packed S189/S185 receipts.

## Focused gates

| Suite | Result |
| --- | --- |
| s134 | 42/42 |
| s163 | 6/6 |
| s176 package | 25 pass, 1 skip |
| s185 package | 17/17 |
| S198 caller both kits | 2/2 |
| spa-fallback + route-shells | pass |
| clean unpack CLIs | pass |

Caller-authored (not fixture ok counts): pricing 3→4 then repeat 4→5 with unknown observation time; distribution-repair incomplete catalog cannot prove global removal; docs-route repeat → unchanged after fix.

## Owning-site gates

| Gate | Result |
| --- | --- |
| client build + route shells | pass (both inner pages) |
| hosted-startup | 4/4 |
| browser desktop | pass |
| browser 390 | pass |
| browser 320 | pass (code `pre` uses overflow-x auto) |
| presence | 25 pass + 1 skip |
| result-reuse | 23/23 |
| public-entry | 5/5 |
| Pulse | 44/46 env skips (TS harness import; missing PG17 initdb); no Pulse source diff vs main |

## Archives (generate-once; not rebuilt)

| Kit | File | sha256 | bytes |
| --- | --- | --- | --- |
| record-repeat | `/kit/record-repeat-job-f3d55e54a7b3.tar.gz` | `f4669fd20660b19fc4d7f6714b63f02cee217973fbc700484b6cc7ceb3f94eef` | 1253839 |
| distribution-repair | `/kit/distribution-repair-2b80f38a4e5e.tar.gz` | `67903e691958c7680fa2c46f2f53f70eac1ee187a71fa42e527dc2830510a033` | 75172 |

Discovery JSON and machineEntry literals match those receipts.

## Remaining limit

Pulse PG17 and TS-extension events harness are environment gaps on this VM, not product-kit defects. Observation time stays unknown unless a digest matches. No production acquisition claim.
