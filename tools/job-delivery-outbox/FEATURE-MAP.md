# Feature map — crash-safe job-result delivery outbox

| Field | Value |
| --- | --- |
| User goal | Persist a completed useful-job result notification, attempt one loopback callback, record ack, and resume after a crash without calling an unknown attempt successful. |
| Entrypoint | `tools/job-delivery-outbox/` (`lib/outbox.mjs`, `lib/index.mjs`) |
| Command | `node tools/job-delivery-outbox/bin/outbox.mjs enqueue\|deliver-once\|status\|reconcile` plus optional `bin/loopback-receiver.mjs` |
| State | `queued` / `unknown` / `failed` / `delivered` (callback ack only). `sold`, `sale`, and `buyerAccepted` stay false. SAMPLE stays SAMPLE. |
| Tests | `node --test --test-concurrency=1 tools/job-delivery-outbox/test/*.test.mjs` |
| Account prerequisite | None. Loopback HTTP only. Optional local Postgres via `initdb`. No wallet, facilitator, production webhook, or daemon. |

## Caller journey

Operator has a completed F08-shaped `receipt.json` (outputs + digests, `sold: false`). They start a localhost receiver, enqueue into a local store (no network), then `deliver-once --opt-in`. After ack, a restarted `status` process shows one acknowledged event. Ack is not a sale.

## Seeded failures

| Case | Result |
| --- | --- |
| Receiver stores body then destroys the socket | `unknown`, not failed or delivered; no auto replay |
| SIGTERM after attempt persist, before HTTP response | Same `eventId` / `termsHash`; state `unknown` |
| Duplicate enqueue | Idempotent; body change under the same event ID refused |
| SAMPLE receipt ack | `sample: true`; `sold`/`sale`/`buyerAccepted` false |

## Bindings Root still owns

F08 wrapper CLI, result mailbox, repeat-job binder, and I01 earned-work are not imported. Receipt schema is `samedaydesk.paid-useful-jobs.receipt.v1` from pin `bae3e7cd`. Terms hash follows I01 canonical JSON + `termsVersion`, with engine identity `archiveSha256:archiveBytes`.
