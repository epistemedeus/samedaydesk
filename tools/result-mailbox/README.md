# Result mailbox

Pickup CLI for completed useful-job artifacts. Given a mailbox directory of
envelopes, copy bytes by `requestId`, verify sha256, and label expiry. Pickup
is not delivery: `ack` records delivered acknowledgment. SAMPLE envelopes
cannot be labelled delivered-to-buyer. Two requestIds cannot retrieve each
other's artifacts.

This module owns the envelope schema. It does not import F08/D01 wrapper
source. Engines come from the published PR51 archive
`client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`.
D01 results are consumed as `samedaydesk.paid-useful-jobs.receipt.v1` plus
the receipt out-dir (current pin PR52 `aeef964fa188443078958d9d6d393afae1d542ee`).
Payments are non-settling prototypes. Expiry is a timestamp comparison against
`--clock`, not a daemon. Result-reuse is a different tool: it projects
observations, it does not hand back job outputs.

## Requirements

- Node.js 22+
- Local filesystem. No wallet, facilitator, or new account.
- Real useful-jobs engines: the committed public archive (sha256
  `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 bytes).

## Literal caller journey

From the repository root:

```bash
NOW=2026-09-11T20:00:00Z
EXP=2026-09-12T20:00:00Z
MAIL=/tmp/result-mailbox-demo
OUT=/tmp/result-mailbox-engine
PICK=/tmp/result-mailbox-pickup

node tools/result-mailbox/bin/mailbox.mjs seed \
  --mailbox "$MAIL" \
  --request-id req-vendor-budget-1 \
  --job-id vendor-budget-impact \
  --before tools/result-mailbox/fixtures/caller/vendor-budget-impact/before.json \
  --after tools/result-mailbox/fixtures/caller/vendor-budget-impact/after.json \
  --out-dir "$OUT" \
  --clock "$NOW" \
  --expires-at "$EXP"

node tools/result-mailbox/bin/mailbox.mjs pickup \
  --mailbox "$MAIL" \
  --request-id req-vendor-budget-1 \
  --out "$PICK" \
  --clock "$NOW"

node tools/result-mailbox/bin/mailbox.mjs ack \
  --mailbox "$MAIL" \
  --request-id req-vendor-budget-1 \
  --clock "$NOW"
```

`pickup.json` records `retrievedAt` with `deliveredToBuyer: false`.
Copied `budget-impact.json` / `.md` bytes and sha256 match the engine out-dir.
`ack` writes `<mailbox>/<requestId>/ack.json` with `deliveredToBuyer: true`.

## Tests

```bash
node --test tools/result-mailbox/test/*.test.mjs
```

## Honesty

- Fixture: SAMPLE / `--example` kit run. Not a buyer delivery.
- Local-runtime: spawn of the published useful-jobs CLI against caller files;
  D01 binding spawns PR52 wrapper from a read-only pin worktree.
- External acceptance: not claimed. No live payment, hosted HTTP mailbox,
  or Postgres store.

I01 content-hash `termsVersion` (`sha256:` + 64 hex) is required. Integer
`termsVersion` is rejected. Mailbox terms are not F08 receipt terms.
D01 wrapper amendments remain a later binding; this package reports the
PR52 pin it actually ran.
