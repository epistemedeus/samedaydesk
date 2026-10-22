# Job delivery outbox (W4-commerce-09)

Crash-safe local outbox for completed useful-job result callbacks. Non-settling
prototype. No daemon, production webhook, or payment.

Default is **no network**. `deliver-once` is opt-in and only POSTs to an operator
loopback URL (`127.0.0.1`, `localhost`, or `::1`). The sender records the attempt
before HTTP. If the HTTP response is missing, the event stays `unknown`, not
`failed` or `delivered`. `deliver-once` will not automatically POST again after an
unknown outcome. A callback ack is not buyer acceptance or a sale.

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

From this directory after `npm install` (for the optional `pg` driver):

```bash
node --test --test-concurrency=1 test/*.test.mjs
```

From the repository root:

```bash
node --test --test-concurrency=1 tools/job-delivery-outbox/test/*.test.mjs
```

Postgres tests start a disposable `initdb` cluster when
`/usr/lib/postgresql/16/bin/initdb` exists. They do not use a hosted database.

## Later bindings (not imported)

Missing W4 siblings must not block this module. Root may later inject:

- `tools/result-mailbox/` for artifact pickup
- `tools/repeat-job-binder/` for changed-input second runs
- I01 Neo earned-work for obligation state (`termsVersion` / canonical terms hash)

This outbox only delivers redacted result references.
