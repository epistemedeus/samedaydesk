# W5-D18 artifact contamination harness

Thin consumer over the current D01 paid-wrapper CLI and D03 `verifyComplete`.
It does not amend `server/paid-useful-jobs` and does not vendor D03.

Proof: a stale, foreign, or partial artifact set cannot satisfy another job.

## Public command

From the repository root, Node >= 22, no extra npm install:

```bash
node experiments/wave5/d18/bin/contamination.mjs satisfy --root <package-dir> --job vendor-budget-impact
```

Exit 0 only when that root satisfies the named job. A complete package for a
different job, a stale `inputsDigest`, or a D03 `partial` / `unknown` package
exits 2.

This binary does not execute jobs. Spawn the D01 CLI for that:

```bash
node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --funding reserved-fixture \
  --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json \
  --out-dir /tmp/d18-a
```

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d18/test/*.test.mjs
```

D03 is loaded from `D03_ROOT`, an in-tree `tools/job-output-atomicity` if
present, or a read-only git worktree of `58cba6324c1d9793d344bc13154b8b2380e8166f`.
A missing validator fails the tests. It is not a skipped pass.

Override the wrapper tree with `F08_ROOT` / `D01_ROOT` when the current
checkout has no `server/paid-useful-jobs/bin/cli.mjs`.

Tested pins are in `PIN.json`. Engine `generatedAt` timestamps make wrapper
`outputsDigest` differ across unlike executions; this harness does not force
those hashes equal. Bind job id, inspected `inputsDigest`, and D03 completeness
of the same package.

## Evidence classes

| Class | Meaning |
| --- | --- |
| `local-runtime` | Real D01 child, real loopback HTTP, or this consumer on disk |
| `fixture` | Crafted incomplete or foreign package |
| `untested-external` | No local Postgres listener; not a fake database |
