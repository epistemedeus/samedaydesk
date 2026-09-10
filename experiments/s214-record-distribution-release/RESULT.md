# S214 RESULT — release composition + end-to-end proof

Parent session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`  
Model: `grok-4.6` · effort `xhigh`  
Node: `v22.22.2` (`/home/ubuntu/.nvm/versions/node/v22.22.2/bin`)  
Branch: `codex/s214-record-distribution-release-20260910`

| Ref | SHA |
| --- | --- |
| Base main | `2b80f38a4e5ec5f080d1764de7c539af63190012` |
| Composition checkout | `b663e53771a325d439f24a2a2ccdc94e5250a352` |
| S206 terminal | `0f9771cff46c939f0e191bf80b7716feff4e62eb` |
| S206 product | `dcc78f31097b3d3a6e23778c5fe77b5af4cc88b1` |
| Product commit | this commit (or branch tip after RESULT commit; no stamp-loop) |

Cash $0. No merge/deploy. Production acquisition: false.

## Pulse ownership

`git diff origin/main -- server/lib/pulse.js server/routes/pulse.js server/scripts/test-pulse*.js` is **empty**. Pulse source/deps/config identical to main. PG17 / `.ts` import env failures were **not** re-run and are not new S214 defects.

Homepage / payment / prices: no diff vs main.

## Owning site (Node 22)

| Gate | Result |
| --- | --- |
| hosted-startup | 4/4 |
| spa-fallback + route-shells | 11/11 combined |
| for-agents overflow | pass |
| client build | both inner shells |
| desktop 1440 | pass (`record-repeat` + `distribution-repair`) |
| mobile 390 | pass |
| width 320 | pass, failures `[]`, pages include both inner jobs |

320 evidence: `/tmp/tmp.6S0hIdosDD` (Cursor collect).

## Clean consumer (committed S206 kits, **no rebuild during that gate**)

Extracted `client/public/kit/record-repeat-job-6a7b5b688584.tar.gz` and `distribution-repair-6a7b5b688584.tar.gz` outside checkout:

- Two callers each kit (pricing 3→4 + CSV `id=1`; DR alpha `/docs` vs beta `/api/v1`)
- Literal next-run (pricing 4→5, `observedAt: unknown`; DR docs redirected → unchanged)
- F1 missing `positive.json` in CWD → `missing-input` (no examples fallback)
- F2 same-path + symlink + existing file refuse, bytes intact
- F3 `null` and `7` → `unsupported-pricing-shape`
- `diagnosis.joined[].acquisition.fixtureDerived === true` on synthesized `linkActivated`; gap `fixture_derived_acquisition`

## Optional shape fix (after repro)

`{ rows: "nope" }` **threw** `rows.entries is not a function`. Adapter now refuses `unsupported-pricing-shape` when `rows`/`items` is not an array. Valid `{rows:[...]}` unchanged.

**Record-repeat kit rebuilt after that proof** so download bytes match the product tree. Distribution-repair kit unchanged (does not vendor the pricing adapter).

## Focused suites (Node 22)

| Suite | Result |
| --- | --- |
| s134 | 42/42 |
| s163 | 7/7 |
| s176 | 27/27 |
| s185 | 20/20 |
| s198 caller-both-kits | 2/2 |

## Kit correspondence (after optional rebuild)

| Kit | File | sha256 | bytes |
| --- | --- | --- | --- |
| record-repeat | `/kit/record-repeat-job-b663e53771a3.tar.gz` | `b2b6ba99096f1beed0de23351ba78427f3b6906e13cdc1732426b3d813979279` | 1253977 |
| distribution-repair | `/kit/distribution-repair-6a7b5b688584.tar.gz` | `479e4ce53986291090e455cd26b364de04e2fe49b6c44fe484e0a57b73f74c56` | 76888 |

Discovery, receipts, and `machineEntry` / `distributionRepairKit.json` match those bytes. New record-repeat unpack: `{rows:"nope"}` structured-refuse.

## Remaining release limits

Pulse PG17 still absent on this VM (not re-run). Recurring merchant-input `express` env gap not part of this product surface. No production acquisition claim. Root still owns merge/deploy.

## Cursor collection

Independent Node 22 re-verify: s134 42/42 · s163 7/7 · s176 27/27 · s185 20/20 · caller-both-kits 2/2; hosted-startup 4/4; spa route-shells + fallback pass. Clean-consumer re-check on current committed kits outside checkout: F1 `missing-input`, F2 nested next-run refuse (alias/exclusive), F3 structured refuse including `{rows:"nope"}`, fixtureDerived visible downstream. Pulse ownership empty vs `origin/main` (PG not re-run).

Capacity at collection boundary (existing VM/process observation, not a new timer): Cursor collector and Heavy parent are distinct OS processes on the same 4-CPU VM (~10.7 GiB MemAvailable, load ~0.1–0.2). Orchestration prompt/resume forest removed from the product tree; compact `native-cells/receipts/final.json` retained.

PR: `gh pr create` returned GraphQL `Resource not accessible by integration`. Feature PR was registered via Cursor ManagePullRequest for user approval (compare URL is not a PR). Cash $0. No merge/deploy.

