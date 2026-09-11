# Feature map — crash-safe job-result delivery outbox

| Field | Value |
| --- | --- |
| User goal | Persist a completed useful-job result notification, attempt one loopback callback to a precise destination, record ack bound to path and digest, and resume after a crash without calling an unknown attempt successful. |
| Entrypoint | `tools/job-delivery-outbox/` (`lib/outbox.mjs`, `lib/index.mjs`, `lib/contract.mjs`) |
| Command | `node tools/job-delivery-outbox/bin/outbox.mjs enqueue\|deliver-once\|status\|reconcile` plus optional `bin/loopback-receiver.mjs` |
| State | `queued` / `unknown` / `failed` / `delivered` (callback ack only). `sold`, `sale`, and `buyerAccepted` stay false. SAMPLE stays SAMPLE. |
| Tests | `node --test --test-concurrency=1 tools/job-delivery-outbox/test/*.test.mjs` |
| Account prerequisite | None. Loopback HTTP only. Local Postgres via `initdb`. No wallet, facilitator, production webhook, or daemon. |

## Caller journey

Operator has a completed SDS52 `receipt.json` (outputs + matching digest, `sold: false`). They start a localhost receiver, enqueue into a local store (no network), then `deliver-once --opt-in`. After ack of eventId+path+digest, a restarted `status` process shows one acknowledged event. Ack is not a sale.

## Seeded failures

| Case | Result |
| --- | --- |
| Same origin, different callback paths | Distinct eventId / termsHash; not an event-id collision |
| Asserted outputsDigest disagrees with listed outputs | enqueue refuses `outputs-digest-mismatch` |
| Missing engine archiveSha256/bytes | enqueue refuses; kit pin is not invented |
| Ack with wrong path or digest | `failed`, not delivered |
| Receiver stores body then destroys the socket | `unknown`, not failed or delivered; no auto replay |
| SIGTERM after attempt persist, before HTTP response | Same `eventId` / `termsHash`; state `unknown` |
| Duplicate enqueue | Idempotent; body change under the same event ID refused |
| SAMPLE receipt ack | `sample: true`; `sold`/`sale`/`buyerAccepted` false |

## Bindings Root still owns

SDS52 wrapper CLI, result mailbox, repeat-job binder, W5-D01 result contract, and I01 earned-work are not imported. Receipt schema is `samedaydesk.paid-useful-jobs.receipt.v1` from pin `aeef964fa188443078958d9d6d393afae1d542ee`. Terms mapping id `samedaydesk.paid-useful-jobs.receipt.v1->job-delivery-outbox.terms.v1`. Engine identity `archiveSha256:archiveBytes`.
