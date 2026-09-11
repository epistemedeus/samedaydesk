# W5-D28 journey release packet

Owner-QA kit: pack the SDS52 paid useful-jobs CLI result, read the artifacts
back, and measure a second job with changed input. Live return and deployed
artifact stay **absent** unless an evidence file is supplied. Fixture payments
are not sales.

Node >= 22, from the repository root. No extra npm install.

```bash
node experiments/wave5/d28/bin/cli.mjs pack \
  --out-dir /tmp/d28-packet \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --funding reserved-fixture \
  --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json

node experiments/wave5/d28/bin/cli.mjs readback --packet /tmp/d28-packet

node experiments/wave5/d28/bin/cli.mjs measure-return --packet /tmp/d28-packet \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after experiments/wave5/d28/fixtures/caller/vendor-budget-impact/after-nochange.json

node experiments/wave5/d28/bin/cli.mjs status --packet /tmp/d28-packet
```

`measure-return` writes `return/` beside `first/`. Shared out dirs are refused.
Same inspected bytes are `same-input-repeat`, not a useful return, even when
`generatedAt` moves output SHA-256.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d28/test/*.test.mjs
```

## What this is not

- Not W5-D01's `createExecutor` / loopback execute HTTP (remaining binding).
- Not Co03's binder or Co17's verify-complete (not on this branch).
- Not a production deploy, recruited trial, or independent demand claim.
