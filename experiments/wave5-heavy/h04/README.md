# W5-H04 useful-job benchmark

Runnable benchmark of twelve before/after useful jobs (schema/webhook, lockfile, API routes, page facts) executed against pinned SDS52 and W4 engines in **read-only** worktrees.

```bash
cd experiments/wave5-heavy/h04
node bin/h04-benchmark.mjs list
node bin/h04-benchmark.mjs smoke   # SAMPLE/--example; not a customer job
node bin/h04-benchmark.mjs run     # catalog vs prior W4/SDS52 pins
node bin/h04-benchmark.mjs m01     # replay vs M01 composition a20232b0 (read-only /tmp/w5-h04/ro-m01)
npm test
```

Node >= 22. No extra npm packages. No live settlement.

See `FEATURE-MAP.md`, `docs/EXAMPLE-CONTRACT.md`, `inventory/PINS.md`.
