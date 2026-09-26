# RECEIPT — W4-commerce-04 / W5-D10 output replay harness

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d10-co04-independent-replay-harness-with-disjoint-output-locations-0c47`
**Starting source:** `ebc71220e034dd28f29d105335c0161a3838831d` (W4 Co04 / PR 66)
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/81
**Owned paths:** `tools/output-replay-harness/`, `experiments/wave5/d10/RECEIPT.md`

## What

Public CLI `replay --job --out-a --out-b` re-runs the PR51 useful-jobs catalog
job twice and classifies `identical | labelled-drift | identity-break`.
`--out-a` and `--out-b` must be disjoint locations. Catalog bytes are captured
immediately after each run so later mutation of the live directories cannot
erase comparison evidence. SAMPLE / `--example` never reports
`identityVerified` as a customer replay.

Pinned useful-jobs 1.0.0 writes `generatedAt` into JSON envelopes. Identity JSON
drops `generatedAt`. Markdown ISO timestamp chatter is labelled-drift, not
proof of equivalent results. Other markdown body differences are identity-break.

Overlapping A/B directories are a valid refusal (`overlapping-output-dirs`),
not an engine failure and not an `identical` identity claim.

## Source vs brief

- Engines live in `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`
  (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`).
  This package extracts that archive and invokes `node bin/useful-jobs.mjs run <id>`.
- SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` was read as a pin only.
  F08 wrappers are not consumed and were not copied.
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

Recorded: **PASS** — 21 tests, 0 fail, 0 skipped. Node v22.14.0. Dependencies: Node >= 22, `tar`,
in-repo archive. No Postgres, wallet, or live origin. No skipped gate.

## Untested

- Real Postgres: not part of this offline replay path.
- Live `https://samedaydesk.com` archive fetch (local HTTP 127.0.0.1 was tested).
- Replay of the other five catalog jobs beyond catalog-output wiring.
- Live payment / F08 wrappers / W2-06 cold-start.
- D01 wrapper contract: this harness still invokes the PR51 useful-jobs CLI.

## Next integration owner

W5-D01. Later binding: consume D01's supplied-input execution contract if that
export is selected; replace the isolated `hashTermsVersion` pin with I01 on
Neo main when present. Do not merge this branch as a kernel into other packages.
