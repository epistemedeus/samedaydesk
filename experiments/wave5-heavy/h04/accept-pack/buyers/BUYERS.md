# Buyer briefs — W5-H04 M01

cwd `/tmp/w5-h04/ro-m01` @ `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`. `--out-dir` is never the RO tree. `--example` SAMPLE is not a sale.

## lockfile-pin-delta

Do not run `npm ci` on the after lock as if the resolved tree were unchanged. On mocha glob-v8, `archy@1.0.0`, `ansi-wrap@0.1.0`, and `array-uniq@1.0.3` keep version and tarball URL while `integrity` rewrites sha1→sha512; those pins moved even though versions did not. This is an operator-risk / pin-delta / integrity-change / resolved-source job, not a vulnerability scanner: H04 does not join advisories, and a hash rewrite is not a CVE proof. The same engine also names adds and removals, treats resolved-URL moves as pin changes, labels key-order noise informational, and refuses `yarn.lock` (exit 2). SAMPLE is not a customer delta.

Case: `experiments/wave5-heavy/h04/examples/lockfile-public/set-a/h04-pub-lock-01`

```bash
cd /tmp/w5-h04/ro-m01
OUT=/tmp/w5-h04/h04-m01-smoke
node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta \
  --before /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/lockfile-public/set-a/h04-pub-lock-01/before.json \
  --after /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/lockfile-public/set-a/h04-pub-lock-01/after.json \
  --out-dir "$OUT/lockfile-pin-delta"
```

## json-schema-webhook-drift

Stop emitting or accepting boolean `exclusiveMinimum`. Draft 04 types it as a boolean modifier of `minimum`; Draft 06 types it as a number (the exclusive bound itself). Callers pinned to `/properties/exclusiveMinimum` break if they keep `true`/`false`. Unused Draft 06 keywords stay off the brief. This is used-path JSON Schema drift, not OpenAPI and not api-upgrade-brief. JSON OpenAPI refuses `not-this-job-openapi`; YAML OpenAPI refuses `not-json` first — neither is a silent schema success. SAMPLE is not a customer brief.

Case: `experiments/wave5-heavy/h04/examples/schema-webhook/h04-schema-01`

```bash
cd /tmp/w5-h04/ro-m01
OUT=/tmp/w5-h04/h04-m01-smoke
node experiments/wave5/m01/bin/run-job.mjs json-schema-webhook-drift \
  --before /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/schema-webhook/h04-schema-01/before.json \
  --after /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/schema-webhook/h04-schema-01/after.json \
  --used /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/schema-webhook/h04-schema-01/used.json \
  --out-dir "$OUT/json-schema-webhook-drift"
```

## route-table-diff

Treat `/for-agents/useful-jobs` as a new public crawler shell (canonical `https://samedaydesk.com/for-agents/useful-jobs`). No existing path, canonical, or robots field moved; the brief is additive (`breaking=no`), not a used-op removal. Do not rewrite the homepage or `spa-route-shells.js` from this job. SAMPLE is not the published route table.

Case: `experiments/wave5-heavy/h04/examples/api-routes/h04-route-01`

```bash
cd /tmp/w5-h04/ro-m01
OUT=/tmp/w5-h04/h04-m01-smoke
node experiments/wave5/m01/bin/run-job.mjs route-table-diff \
  --before /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/api-routes/h04-route-01/before.json \
  --after /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/api-routes/h04-route-01/after.json \
  --out-dir "$OUT/route-table-diff"
```

## page-change-offline-job

Stop reading a “verified” row as “OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree.” On the held `/x402/verified` snapshots, the published rule is a matching CDP Bazaar row observed within seven days of the crawl; title and h1 stay, so a title-only watcher is the wrong job. This compares already-held extract-batch JSON. It does not fetch URLs (`networkUsed=false`; `claims.fresh` stays false). `--example` refuses `sample_as_delivered_watch` and is not a delivered watch.

Case: `experiments/wave5-heavy/h04/examples/page-facts/h04-page-03`

```bash
cd /tmp/w5-h04/ro-m01
OUT=/tmp/w5-h04/h04-m01-smoke
node experiments/wave5/m01/bin/run-job.mjs page-change-offline-job \
  --job /tmp/w5-h04/wt/experiments/wave5-heavy/h04/examples/page-facts/h04-page-03/job.json \
  --out-dir "$OUT/page-change-offline-job"
```
