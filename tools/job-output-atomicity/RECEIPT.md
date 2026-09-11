# RECEIPT — W4-commerce-17 interrupted-output atomicity

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `codex/w4-commerce-17-20260911`
**Owned path:** `tools/job-output-atomicity/`
**Starting main:** `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
**Test run:** pending first execution after this land; this file is updated with counts after `node --test`.

## Pins

| Item | SHA / path |
| --- | --- |
| SDS main start | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| F08 named assignment pin | `bae3e7cd5034b21019fb272a99d88db964b831ee` |
| F08 tested public CLI (I02 tip) | `aeef964fa188443078958d9d6d393afae1d542ee` |
| I01 hashTermsVersion | Neo PR54 `819fa637ecf5e5177c84efc16fcaa18d57017631` `packs/funded-task-terms/src/hash.mjs` |
| useful-jobs archive | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` / 2522418 bytes |

## Commands

```bash
git fetch origin fable/f08-paid-wrappers
node --test tools/job-output-atomicity/test/*.test.mjs
node tools/job-output-atomicity/bin/verify-complete.mjs --root <dir>
```

Node >= 22. No extra packages. F08 is fetched into a detached worktree; not copied into this module.

## Next integration owner

Root. Producer atomicity amendments stay with I02.
