# Result mailbox contract (W5-D05)

Kernel for request-bound pickup of completed useful-job artifacts.
Consumers import `lib/index.mjs` or spawn `bin/mailbox.mjs`.
This is not F08 `paid-useful-jobs.receipt.v1` and not D06's callback outbox.

## Commands

| Command | Effect | `deliveredToBuyer` |
| --- | --- | --- |
| `seed` | Write envelope + artifact bytes under `<mailbox>/<requestId>/` | remains `false` |
| `pickup` | Copy this request's verified bytes to `--out`; write `pickup.json` | always `false` |
| `ack` | Record delivered acknowledgment for this `requestId` only | `true` (non-SAMPLE) |

Pickup is not delivery. `--delivered` on pickup is refused (SAMPLE:
`sample-not-delivered`; otherwise `pickup-is-not-delivery`). Use `ack`.

## Request binding

- `requestId` is 1-128 `A-Za-z0-9._-` and cannot be `.` or `..` or escape
  the mailbox root.
- Slot path is `<mailbox>/<requestId>/`. Envelope `requestId` must match the slot.
- Pickup of A cannot read B's `artifacts/`. Unknown `requestId` is
  `unknown-request`, not another job's files.

## Schemas

- Envelope: `samedaydesk.result-mailbox.envelope.v1`
- Pickup: `samedaydesk.result-mailbox.pickup.v1`
- Ack: `samedaydesk.result-mailbox.ack.v1`
- Mailbox terms: I01 content hash `sha256:` + 64 hex. Integer `termsVersion`
  is rejected. Mailbox terms are not F08 receipt terms; hashes are not forced equal.

## D01 result contract (consumed, not vendored)

Current pin tested: SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`
(`samedaydesk.paid-useful-jobs.receipt.v1`). Seed with `--from-d01-receipt`
plus the receipt `outDir`. This mailbox does not import `wrapper.mjs`.
D01 may amend the wrapper; remaining binding is receipt schema + output
bytes, not a claimed future D01 runtime.

A refused or `engineResult.ok === false` receipt is not stored as a
retrievable useful delivery. That is a valid analysis/transport outcome,
not a mailbox crash.

## Honesty

Local CLI + filesystem. No HTTP mailbox, Postgres store, wallet, or live
settlement. SAMPLE cannot be acknowledged delivered-to-buyer. `sold` is
always false.
