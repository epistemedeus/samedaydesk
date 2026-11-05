# E06+363 coherent family — base/diff and deployment bind

## Merge base

- Default-main before PR363 merge: `09b2d6155ce247d828355183c9367889daf5f0f0`
- PR363 merge commit: `493e6c4fcb3ef807b365a7ff56c4ba855d212409` (parents main + `a7d8a204`)
- This producer-gate amend: same branch `codex/n5-e06-user-route-20261105` tip after a7d8a204

## Diff scope (experiments only)

All paths under `experiments/n5-e06-lifecycle/`. No human-facing discovery page, no hosted homepage, no price/principal/account change. Ordinary source-only integration is team-authorized; do not gate this family on human homepage review.

## Preserved hosted source

`9f6c0c4e396dd7677f334400eed93e3445fad600` (AGL seed-loop merge tip) remains a diverged hosted line for PRs 364–367. This E06 family does not rewrite or force-merge that tip. Rollback for the PR363 merge remains `git revert -m 1 493e6c4f`.

## Deployment behavior

- Maintained consumer: npm of useful-jobs 1.4.7 per USER-ROUTE (cold agent).
- Cold suite: `cold-dpm.sh` on enrolled model-free Terminal; RECEIPT v2 `executed` vs `qualifiedHistorical`; nonzero on FAIL.
- Original cold outDir `cold-dpm-20261105T084819Z` and collect bind at pilot `e9803cf` stay as received; no successful-install rerun for clock refresh.
- Producer regression: `cold-dpm-producer-regression.sh` (positive / failure / copied-source / override); no package reinstall.
