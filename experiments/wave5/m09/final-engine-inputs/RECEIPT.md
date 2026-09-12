# RECEIPT — W5-M09 final-engine-inputs (shipped CLI)

Own path: `experiments/wave5/m09/final-engine-inputs/`
Branch: `cursor/w5-m09-independent-page-snapshots-with-meaningful-vs-irrelevant-change-controls-d8cf`
Date: 2026-09-12
Node: v22.14.0
This consumer does not publish. Root reconciles.

## Source actually executed

| Item | Value |
| --- | --- |
| D01 PR74 | `46f2b7f55a7fb780333073a5197b64b8fde64a33` |
| Public PR114 | `9ae0febd8c184c0cbbb5e481ba31ac620e89b869` |
| Kit | `useful-jobs-1.2.0.tar.gz` sha256 `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb` (2579117 bytes) |
| Kit root used | `/tmp/w5-m09-kit-1.2.0/useful-jobs-1.2.0` |
| Jobs in catalog | 10 |
| Engine | `@samedaydesk/page-change-offline-job` **0.1.1** catalog pin `fec7bc04ac4419f8e7ce40f2613314e6953af6bc` |
| CLI | `node bin/useful-jobs.mjs run page-change-offline-job --job PATH --out-dir DIR` |
| Not tested here | Co13 `91b57334`, kit sample `h04-page-01`, parent `experiments/wave5/m09/test/*`, D15 freeze/path mutation |

Page pair A (number/date/status):

```
git show c26fcd30395fd5a9be835458578d6eef65950857:client/public/reports/ai-search-readiness-leaderboard-2026.html
git show 4d1ba68dc751bb1a23bb32aa28613884785e7139:client/public/reports/ai-search-readiness-leaderboard-2026.html
```

Page pair B (title/description/h1):

```
git show 4052f0fbf41c8b48823c6a3d58b6cd89c715abe1:client/public/tools/schema-validator.html
git show 374a565784bcd4ec89eeda7fedbb9610fed77473:client/public/tools/schema-validator.html
```

Expected fact diffs were written in `lib/corpus.mjs` / each `expected.json` **before** the engine spawn.

## Actual command

```sh
node --test --test-concurrency=1 experiments/wave5/m09/final-engine-inputs/test/*.test.mjs
node experiments/wave5/m09/final-engine-inputs/bin/run-case.mjs number-date-status-leaderboard
node experiments/wave5/m09/final-engine-inputs/bin/run-case.mjs whitespace-title
```

Shipped spawn (kit root as above):

```
node bin/useful-jobs.mjs run page-change-offline-job --job experiments/wave5/m09/final-engine-inputs/snapshots/cases/<id>/job.json --out-dir DIR
```

`--max-changes 1` is forwarded on `max-changes-omits-sibling` only.

## Verdict

**FAIL (one usefulness counterexample).** 12 pass, 1 fail, 0 skip.

Correct on this CLI (0.1.1), expectations not relaxed:

| Case | Engine |
| --- | --- |
| number-date-status-leaderboard | `changed`, paths `/title` `/description`, excerpts contain 136→189, 7→10, grade-status copy; headings/links not listed; `usefulOutputProven=true`, `complete=true`, `fresh=false`, `freshness=unknown` |
| headings-omit-company-count | `unchanged` (unselected title numbers are not a selected-field miss) |
| nav-price-unselected | `unchanged` ($39 / nav identical) |
| nav-links-reorder | `reordered`, class `order` at `/links`, `contentUnchangedProven=true` |
| missing-canonical | `incomplete`, coverage-unknown `canonical` / `absent_field_is_coverage_unknown_not_deletion`, not a deletion op |
| failed-capture | `incomplete`, failed row, `usefulOutputProven=false` |
| identical-replay | `unchanged`, `contentUnchangedProven=true` despite different jobId/fetchedAt |
| ambiguous-duplicate-source | `ambiguous`, no silent `/title` replace |
| schema-validator-in-bounds | `changed`, `/title` `/description` `/headings/h1` |
| max-changes-omits-sibling | `changed`, one path (`/description`), sibling omitted, `complete=false`, `limitsHit=["maxChanges"]` |
| refused live URL | exit 2 `live_fetch_url`, loopback HTTP hits=0 |

## Minimal counterexample

`whitespace-title`: extra ASCII space in the held 189-company title.

Expected (written first): `verdict=unchanged`, no `/title` path, `contentUnchangedProven=true` (whitespace is not a number/date/status fact).

Observed:

```
verdict=changed
path=/title
before: "… — 189 companies scored across 10 industries"
after:  "… — 189  companies scored across 10 industries"
usefulOutputProven=true
complete=true
contentUnchangedProven=false
```

The engine does literal JSON string compare. It does not fold whitespace. That is a usefulness miss for extracted changed facts, not an unsupported-field refusal.

## Next owner

- **W5-M05** (`tools/page-change-offline-job/`): decide whether selected-field compare folds insignificant whitespace, or keep literal compare and stop calling a whitespace-only title replace useful output.
- **W5-D01 / W5-M01**: no catalog/homepage change from this consumer.
- **Root**: publish after reconciliation. This worker does not merge or deploy.

D15 remains owner of freeze/path mutation. Not duplicated.

No purchase, email, production load, merge, or extra Cloud agents.
