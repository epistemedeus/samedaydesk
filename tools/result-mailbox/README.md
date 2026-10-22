# Result mailbox

Pickup CLI for completed useful-job artifacts. Given a mailbox directory of
envelopes, copy bytes by `requestId`, verify sha256, and label expiry. Pickup
is not delivery: `ack` records delivered acknowledgment. SAMPLE envelopes
cannot be labelled delivered-to-buyer. Two requestIds cannot retrieve each
other's artifacts.

This module owns the envelope schema. It does not import F08/D01 wrapper
source. Engines come from the published PR51 archive
`client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`.
D01 results are consumed as `samedaydesk.paid-useful-jobs.execution.v1`
(current pin `6bed72dd22a396134aa5c957933b42c3a5746698`) plus the execution
out-dir. Nested receipt.v1 is validated, not assumed from aeef964.
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
  D01 binding spawns `server/paid-useful-jobs` CLI/library from pin
  `6bed72dd22a396134aa5c957933b42c3a5746698` (execution.v1).
- External acceptance: not claimed. No live payment, hosted HTTP mailbox,
  or Postgres store.

`--funding reserved-fixture` requires `--payment` with a recognized fixture object
(same rule in the CLI and `runPaidOffer`). Intent alone is not a reservation.

I01 termsVersion `samedaydesk.mailbox.i01-private-result-mailbox.v1`
(`sha256:8a014f7d6db9a5a2a9010d9f7cc84e51abeac911d3c225ff7ef619a6f3a0f0c0`)
is the I01 private-mailbox terms string. It is not
`samedaydesk.x402.pay.v1` and is not a payment, Stripe, or x402 receipt.
