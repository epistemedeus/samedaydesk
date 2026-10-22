# Job delivery outbox (W5-D06 / Co09)

Crash-safe local outbox for completed useful-job result callbacks. Non-settling
prototype. No daemon, production webhook, or payment.

Default is **no network**. `deliver-once` is opt-in and only POSTs to an operator
loopback URL (`127.0.0.1`, `localhost`, or `::1`). Destination identity is origin plus
pathname and query, not origin alone. The sender records the attempt before HTTP.
If the HTTP response is missing, the event stays `unknown`, not `failed` or
`delivered`. An ack must bind `eventId`, callback path, and the recomputed
outputs digest. `deliver-once` will not automatically POST again after an unknown
outcome. A callback ack is not buyer acceptance or a sale.

Outbox terms.v1 is a mapped document from SDS52 receipt.v1. Unlike schemas are
not forced to the same hash. The kit archive pin is not invented for a receipt
that omitted engine identity.

## Commands (from repository root, Node >= 22)

```bash
# Terminal A: loopback receiver
node tools/job-delivery-outbox/bin/loopback-receiver.mjs --mode ack --store-dir /tmp/outbox-recv

# Terminal B: enqueue a completed F08-shaped receipt (does not POST)
node tools/job-delivery-outbox/bin/outbox.mjs enqueue \
  --store /tmp/outbox-store \
  --receipt /tmp/receipt.json \
  --callback-url http://127.0.0.1:PORT/callback

# Opt-in one delivery attempt
node tools/job-delivery-outbox/bin/outbox.mjs deliver-once \
  --store /tmp/outbox-store \
  --event-id evt_... \
  --opt-in

node tools/job-delivery-outbox/bin/outbox.mjs status --store /tmp/outbox-store
node tools/job-delivery-outbox/bin/outbox.mjs reconcile --store /tmp/outbox-store
```

Optional local Postgres (prototype store, not a ledger):

```bash
node tools/job-delivery-outbox/bin/outbox.mjs status --postgres postgres://outbox@127.0.0.1:PORT/postgres
```

## Tests

From this directory after `npm install` (for the `pg` driver):

```bash
node --test --test-concurrency=1 test/*.test.mjs
```

From the repository root:

```bash
node --test --test-concurrency=1 tools/job-delivery-outbox/test/*.test.mjs
```

Postgres tests start a disposable `initdb` cluster when
`/usr/lib/postgresql/16/bin/initdb` exists. Missing Postgres is incomplete, not a
passed skip. SDS52 wrapper CLI is fetched into a read-only worktree.

## Later bindings (not imported)

- W5-D01 result contract: not published; this module consumes SDS52
  `aeef964fa188443078958d9d6d393afae1d542ee` receipt.v1
- `tools/result-mailbox/` for artifact pickup
- `tools/repeat-job-binder/` for changed-input second runs
- I01 Neo earned-work obligation state (`termsVersion` / canonical terms hash)

This outbox only delivers redacted result references.
