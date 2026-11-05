# E06 + PR363 source binding (BOT-PRIMARY-1105)

Original cold D/P/M is already received. Do not rerun installs for a newer timestamp.

## Bound executable source

| Item | Value |
| --- | --- |
| Runner / PR363 tip | `a3efc2c40a246456c7909806a986442a862adfe8` |
| Tree | `ed26a99c82d6bd376de34b4d0768ab0435df5971` |
| Branch | `codex/n5-e06-user-route-20261105` |
| Script sha256 | `2b6a7230e49000513c410f4dc1813717368c8434c62cdab965a4c3269123df5e` |
| E06 base (package manager suffices) | `a35510157235ddf9ecb32c843790756fbc30e8b7` tree `133e47f5` |
| Fair-routes docs (3 files vs E06) | `a32cab0cb531` |
| Suite add (not tip) | `90444f3f89d2` |
| Package | useful-jobs 1.4.7 |
| Package sha256 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` |
| Expect digest | `0ea6c814c944ec14` |

## Original remote receipt

- VM outDir: `/tmp/n4-team/rd/cold-dpm-20261105T084819Z`
- Collect Git: epistemedeus/pilot@`cb6ceaa64ac784d946b0211f8a2d59a72dc62d0d` path `overview/self-evaluations/2026-11-05-n4-collect/rd`
- Authoritative manifest: cohort parent `overview/self-evaluations/2026-11-05-n4-collect/SHA256SUMS` content sha256 `da1b02e23589285fcdefa40a094af887511cb7905475974aeaa27ec004a7035a`
- Original `RECEIPT.json` had `"head":"PENDING"`. That is incomplete binding only. The suite that produced summary.tsv was the runner above. This file and the cold-dpm.sh RECEIPT writer bind that head without another cold install.

## Coherent family for ordinary integration

Receive E06 lifecycle evidence plus PR363 amendments (USER-ROUTE, FAIR-ROUTES, RESULT touch, cold-dpm.sh) as one scoped family. Do not merge `a3efc2c4` as an orphan leaf onto divergent default-main history. Merge to main stays Root/operator for human-facing surfaces.

## Accepted vs not claimed

Accepted from original summary: D/P/M PASS at digest `0ea6c814c944ec14`; REFUSE_146 / REFUSE_BADSHA / REFUSE_TRUNC PASS; invoke shape E06 npm cwd.

Not claimed: outside demand, live traffic, human-page publication, revenue, or that the digest alone proves an unsupported source beyond useful-jobs 1.4.7 vendor-budget-impact on the enrolled Terminal.

## Named later consumer

Fresh cold agent installs useful-jobs@1.4.7 with RESULT integrity and runs vendor-budget-impact on supplied-row input; not the writer checkout.
