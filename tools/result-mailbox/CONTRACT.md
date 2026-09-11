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

Current pin tested: this tree's `server/paid-useful-jobs`
(`samedaydesk.paid-useful-jobs.execution.v1`, PR 74). Nested receipt remains
`samedaydesk.paid-useful-jobs.receipt.v1` and is not mailbox envelope terms.
Seed with `--from-d01-execution` (or `--from-d01-receipt` for a receipt that
carries `contract` + `delivery`). Prefer `runOutDir` over a published copy.
This mailbox does not import `wrapper.mjs` and does not spawn an engine.

Retrievable means `transport === "ok"` and `delivery.complete === true`.
Useful analysis `refused` / `informational` with complete artifacts can be
put, picked up, and acknowledged. Crash, timeout, acquisition failure, missing
output, and unknown jobs cannot. Pickup is still not delivery.

aeef964 receipt.v1 without `contract`/`delivery` is rejected. Do not assume
that older pin's `engineResult.ok === false` gate.

## Honesty

Local CLI + filesystem. No HTTP mailbox, Postgres store, wallet, or live
settlement. SAMPLE cannot be acknowledged delivered-to-buyer. `sold` is
always false.
