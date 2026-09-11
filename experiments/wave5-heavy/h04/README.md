# W5-H04 useful-job benchmark

Runnable benchmark of twelve before/after useful jobs (schema/webhook, lockfile, API routes, page facts) executed against pinned SDS52 and W4 engines in **read-only** worktrees.

```bash
cd experiments/wave5-heavy/h04
node bin/h04-benchmark.mjs list
node bin/h04-benchmark.mjs smoke   # SAMPLE/--example; not a customer job
node bin/h04-benchmark.mjs run     # catalog examples vs expected-report.json
npm test
```

Node >= 22. No extra npm packages. No live settlement.

See `FEATURE-MAP.md`, `docs/EXAMPLE-CONTRACT.md`, `inventory/PINS.md`.
