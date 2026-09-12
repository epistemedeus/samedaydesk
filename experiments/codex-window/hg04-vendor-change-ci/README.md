# hg04 vendor-change-ci

CI consumer of released useful-jobs **vendor-budget-impact** for a caller who
already holds a dated upstream pricing-row pair.

This experiment owns only this directory. It does not change the job engine,
homepage, payments, deploy, or public kit bytes.

## What it does

1. Verifies a pinned useful-jobs archive (released 1.4.0 by default).
2. Independently checks schema, unit comparability, coverage, and membership.
3. Runs `node bin/useful-jobs.mjs run vendor-budget-impact --before --after`.
4. Writes a reviewable markdown/JSON pair plus `machine-action.json`.
5. Compares a frozen `expected.json`. On mismatch it fails CI and **does not**
   rewrite the baseline.
6. Never claims an invoice or forecast. List-price deltas are not bills.

Released 1.4.0 can mark an incomplete after-snapshot as `actionable` when one
shared field changed and other fields look `removed`. The wrapper overrides that
to `partial` when `capture.complete` is false or declared fields are missing.

## Pins

Released 1.4.0 (default):

- URL: `https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`
- GitHub pin: `https://github.com/epistemedeus/samedaydesk/raw/ad9bc7b448cf1f635ff1488affbe206aaf981ac0/client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`
- sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`
- bytes `2575215`
- source commit `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`

Draft 1.4.1 (PR 119, not default, not treated as live):

- sha256 `b365d95c8fb7695f96248433a7d440c9917b4d5085b1ce71b3982e4291e1bc3d`
- bytes `2575456`
- Use only with `--allow-candidate` after a URL verifies those bytes.

## Run

Node 22, heap cap 768MB, tests serial.

```bash
export NODE_OPTIONS=--max-old-space-size=768
node bin/vendor-change-ci.mjs run --fixture openai-gpt35-turbo-20230613-20240125 --out-dir ./out/openai
python3 bin/vendor-change-ci.py run --fixture hostile-partial-capture --out-dir ./out/hostile
node --test --test-concurrency=1 test/*.test.mjs
```

Caller files:

```bash
node bin/vendor-change-ci.mjs run \
  --before ./before.json \
  --after ./after.json \
  --source ./SOURCE.json \
  --baseline ./expected.json \
  --out-dir ./out/budget
```

`--update-baseline` is refused.

## Fixtures

- `openai-gpt35-turbo-20230613-20240125` is one actual public provider revision.
  Primary pages fetched 2026-09-12:
  [2023-06-13](https://openai.com/index/function-calling-and-other-api-updates/)
  (`$0.0015` / `$0.002` per 1K) and
  [2024-01-25](https://openai.com/index/new-embedding-models-and-api-updates/)
  (`$0.0005` / `$0.0015` per 1K). Historical list snapshots, not current prices.
- `hostile-partial-capture` drops the output row from that same after post.
  Kit 1.4.0 may still say `actionable`; the wrapper result is `partial`.

GitHub Actions example: `github-actions/vendor-change-ci.yml`.
