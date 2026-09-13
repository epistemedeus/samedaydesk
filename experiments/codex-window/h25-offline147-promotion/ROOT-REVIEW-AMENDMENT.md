# H25 Root review amendment and independent command replay

Mechanical Cursor Cloud D edit on existing branch `codex/h25-offline147-promotion-20260913`. No new native parent. H25 session `da4d24f2-628a-4df5-9b51-596bfc1d6313` stayed terminal. Approved 1.4.7 bytes were not rebuilt (**5255824**, `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`). No main merge, deploy, payment, or hosted-acquisition claim.

## Copy correction

Public intro/SEO now uses the Root summary (ten useful offline jobs; no H21 / worker roster / inherited disclaimers in headlines). One precise 1.4.7 release-note paragraph remains in the UsefulJobs boundary section, discovery `note`, and crawler scope section. `newlyReviewedJobIds` / `inheritedJobIds` and offline/no-authority flags are unchanged. Discovery was regenerated with `experiments/codex-window/h25-offline147-promotion/scripts/write-discovery.mjs`.

## Independent replay (this VM)

```sh
TMPDIR=/tmp/h25/runtime-tmp NODE_OPTIONS=--max-old-space-size=768 \
  flock /tmp/h25/runtime-tmp/test.lock \
  node --test --test-concurrency=1 --test-reporter=tap \
  experiments/codex-window/h25-offline147-promotion/test/*.test.mjs
# TAP: /tmp/h25/heavy-logs/root-amend-h25.tap
# 6 pass / 0 fail (includes served dist acquire + public-copy)

TMPDIR=/tmp/h25/runtime-tmp NODE_OPTIONS=--max-old-space-size=768 \
  flock /tmp/h25/runtime-tmp/test.lock \
  node --test --test-concurrency=1 --test-reporter=tap \
  experiments/s260-useful-jobs-public-integration/test/*.test.mjs
# TAP: /tmp/h25/heavy-logs/root-amend-s260.tap
# 27 pass / 0 fail
```

Owned `vite preview` on port **4187** was not listening after H25 teardown. Parent `ad9bc7b448cf1f635ff1488affbe206aaf981ac0` unchanged.
