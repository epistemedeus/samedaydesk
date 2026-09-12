# RESULT — W5-M08 final-input check of useful-jobs 1.2.0

Independent reader-semantics check through the shipped CLI. Not a second
kernel. Does not re-run inherited `experiments/wave5/m08/test/*.test.mjs`
or D01 `tools/route-table-diff/test/comparison.test.mjs`.

## Pins

| Surface | Exact source |
| --- | --- |
| D01 PR74 | `46f2b7f55a7fb780333073a5197b64b8fde64a33` |
| Public PR114 | `9ae0febd8c184c0cbbb5e481ba31ac620e89b869` |
| Archive | `useful-jobs-1.2.0.tar.gz` 2579117 bytes, sha256 `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb` |
| Catalog engine pin | `886c81d824e0a24e2faa5b821b1cd0ca46ae0859` |
| Kit vs D01 `lib/{identity,catalog,digest}.mjs` | identical sha256 on this VM |

## Command

```bash
cd /tmp/w5-m08-kit/extract/useful-jobs-1.2.0
node bin/useful-jobs.mjs run route-table-diff --before <file> --after <file> --out-dir <dir>
```

Harness: `cd experiments/wave5/m08/final-engine-inputs && node --test --test-concurrency=1 test/*.test.mjs`

Observed: **17 passed, 0 failed, 0 skipped.** Node v22. Missing kit is incomplete, never a skip.

## Verdict

**Shipped reader matches claimed SDS semantics. No kernel defect. Stop.**

Prior M08 finding that Co12 `7387eb67` digest changed with order does **not**
hold on this kit. `tableDigest` is digest.v2; permutation hashes are equal.

First-wave consumer refusal of Next.js-shaped JSON is **not** a claim about
this engine. SDS `{path, canonical, title}` with `/tools/[slug]` is a literal
path. That is correct: the job is not a Next/Express/OpenAPI parser.

## Observed (cwd = extracted 1.2.0 kit)

Caller-owned D01 extract is 15 SPA shells at PR74, homepage `/` excluded.
Kit sample `samples/routes/h04-route-01/after.json` hashes to the same digest
as that extract (`sha256:fd11af04e962e8daefd9b88090059e62ed28d102803452fb9e582909c9cefea8`).

| Case | Input | outcome / code | exit |
| --- | --- | --- | --- |
| Permutation | `inputs/d01-spa-shells.json` vs `d01-spa-shells-permuted.json` | `permutation`, equal digest, added/removed=0 | 0 |
| Trailing slash | vs `d01-spa-shells-trailing-slash.json` | `no-change`, equal digest. Wrong caller delta, not an add | 0 |
| Case | vs `d01-spa-shells-case.json` | `breaking`, removed `/terms`, added `/Terms`. Case-folding is not claimed | 0 |
| Positive add | kit `h04-route-01/{before,after}.json` | `changed`, added `/for-agents/useful-jobs`. Not unsupported | 0 |
| Positive remove | vs `d01-spa-shells-minus-useful-jobs.json` | `breaking`, removed `/for-agents/useful-jobs` | 0 |
| Method-only | `method-only.json` (Express GET/POST, no title/canonical) | `unsupported_catalog` | 2 |
| GET+POST SDS | `method-sds-single.json` vs `method-get-post-sds-same-path.json` | `breaking`, path collision on `/v1/projects/:projectId/events`. Method is not identity | 0 |
| Literal `[slug]` | D01 vs `d01-spa-shells-plus-wildcard.json` | `changed`, added `/tools/[slug]`. Not a wildcard parser | 0 |
| Express source | `express-correspondence.excerpt.mjs` from D01 `vendor/neomorphic-correspondence/dist/app.js` | `invalid_catalog` (not JSON). No invented routes | 2 |
| Next page | caller-owned `next-app-router.excerpt.tsx` | `invalid_catalog` | 2 |
| OpenAPI | compact excerpt of D01 `fixtures/presence/catalog/openapi.json` | `unsupported_catalog`, `detail.format=openapi` | 2 |
| Kit OpenAPI YAML | `samples/openapi/a/before.yaml` | `invalid_catalog` | 2 |
| Homepage | `inputs/homepage.json` | `homepage_rewrite_refused`. `--rewrite-homepage` same code | 2 |

## Failure / counterexample

None against claimed SDS catalog semantics.

Explicit unsupported/unknown is correct. Not every unlike framework feature is
a bug.

## Next owner

Root publishes after reconciliation. This check does not merge or deploy.

No W5-M04 kernel amendment from these inputs. Catalog/offer still on SDS52
1.0.0 wrappers is W5-M01, outside this check.

## Non-claims

`paid=false`, `settled=false`. No purchases, customer files, production load,
email, or homepage/shell writes.
