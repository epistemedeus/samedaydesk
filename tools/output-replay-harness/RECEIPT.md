# RECEIPT — W4-commerce-04 output replay harness

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `codex/w4-commerce-04-20260911`
**Source head:** `7d51c09a2ed918df3d9b11f1980a52e23f524dd1`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/66
**Compare:** https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-04-20260911
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs)
**Owned path:** `tools/output-replay-harness/`

## What

Public CLI `replay --job --out-a --out-b` re-runs the PR51 useful-jobs catalog
job on the same caller files twice, compares catalog output filenames only, and
classifies `identical | labelled-drift | identity-break`. SAMPLE / `--example`
never reports `identityVerified` as a customer replay.

Pinned useful-jobs 1.0.0 writes `generatedAt` into JSON envelopes. Markdown for
`api-upgrade-brief` is byte-stable. Identity JSON drops `generatedAt`. Markdown
timestamp chatter is not identity-break when identity JSON matches.

## Source vs brief

- Engines live in `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`
  (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`).
  This package extracts that archive and invokes `node bin/useful-jobs.mjs run <id>`.
- `samples/openapi/a/after.yaml` and `samples/openapi/b/after.yaml` are
  byte-identical in this archive. The seeded after.yaml swap uses
  `samples/openapi/caller-alpha/after.yaml`.
- I01 Neo PR54 `hashTermsVersion` is an isolated pin under
  `vendor/funded-task-terms/` (MIT). Integer `termsVersion` is not a public
  claim key. Original F01 occupancy kernel is not copied.
- F08, W2-06, homepages, `server/pricing.js`, and root `package.json` were not
  edited.

## Commands / pass-fail

```bash
cd tools/output-replay-harness
node --test test/*.test.mjs
```

**PASS** — 16 tests, 0 fail. Node v22.14.0. Dependencies: Node >= 22, `tar`,
in-repo archive. No Postgres, wallet, or live origin.

Caller journey (local-runtime, `identityVerified: true`,
`classification: labelled-drift` because of `generatedAt`):

```bash
KIT=$(node -e "import {ensureUsefulJobsKit} from './tools/output-replay-harness/lib/kit.mjs'; process.stdout.write(ensureUsefulJobsKit())")
node tools/output-replay-harness/bin/replay.mjs \
  --job api-upgrade-brief \
  --before "$KIT/samples/openapi/a/before.yaml" \
  --after "$KIT/samples/openapi/a/after.yaml" \
  --used "$KIT/samples/openapi/a/used.json" \
  --out-a /tmp/orh-a --out-b /tmp/orh-b
```

Seeded failures covered: in-place after.yaml swap → `identity-break`;
`--example` cannot set `identityVerified`; SAMPLE `caller-alpha` stays sample;
missing required inputs refuse; local HTTP wrong digest never extracts.

## Untested

- Real Postgres: not part of this offline replay path.
- Live `https://samedaydesk.com` archive fetch (local HTTP 127.0.0.1 was tested).
- Replay of the other five catalog jobs beyond catalog-output wiring.
- Live payment / F08 wrappers / W2-06 cold-start.

## Next integration owner

Root. Later binding: replace the isolated `hashTermsVersion` pin with I01 on
Neo main when present. Do not merge this branch as a kernel into other W4
packages.
