# How to run the W5-D26 price-floor experiment

From `experiments/wave5/d26`, Node 22. No wallet, no public endpoint load,
no live payment.

## Live lockfile offer (current)

Requires a disposable merchant worktree at `D26_MERCHANT_ROOT`
(default `/tmp/d26-merchant`) pinned to
`ca38205279f0d543515b81b7261909e55ea2600f` with `npm install --omit=dev`,
and the H04 corpus worktree at `D26_H04_ROOT` (default
`/tmp/readonly-refs/sds-h04`) at `7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc`.

```bash
node bin/price-floor.mjs profile
node bin/price-floor.mjs source-export
```

`profile` mounts `POST /lockfile-pin-delta` ($0.005, x402-only) against an
injectable fake facilitator, runs H04 public lockfile pairs plus controlled
near-limit/timeout/refusal cases, and records CPU, wall, peak RSS, output
bytes, and settle counts. Concurrency 1/6/12 is a latency comparison, not a
loadtest. Writes `measured/profile.json`, `measured/profile.csv`, and a
compact 0.005 recommendation that does **not** claim no-loss.

## Historical F08 assumed scenario (not the live offer)

```bash
node bin/price-floor.mjs journey --buyer-class owner-qa
```

This still runs SDS PR52 wrappers at 0.003 with the AWS T2/T3 60s compute
model. JSON is labelled `historicalAssumedScenario: true` and
`liveLockfileOffer: false`. See `historical/f08-t3-assumed-scenario.md`.

Tests:

```bash
node --test --test-concurrency=1 test/*.test.mjs
```
