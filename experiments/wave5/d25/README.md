# W5-D25 buyer journey harness

Owner-QA harness for SameDayDesk supplied-input jobs. It covers public
offer discovery, caller-supplied input, delivery of advertised artifacts,
and a return job with a changed after file.

This is not a second paid-wrapper, binder, or catalog. It calls:

1. HTTP GET of `client/public` catalog and discovery JSON
2. D01 `node server/paid-useful-jobs/bin/cli.mjs`
3. D09 `node tools/repeat-job-binder/bin/bind.mjs` at W4 Co03
   `7c55738cc5730985b709282af6c24e10f0a8442f` (read-only worktree)

Runs are labelled `owner-qa`. They are not customers, recruited buyers,
independent demand, or settlements. Live settlement is out of scope.

## Commands

From this directory, Node >= 22:

```bash
npm test
node bin/buyer-journey.mjs offer
node bin/buyer-journey.mjs journey --out-dir /tmp/w5-d25-owner-qa
```

From the repository root:

```bash
node experiments/wave5/d25/bin/buyer-journey.mjs journey
```

D09 is fetched into a detached worktree when `W5_D09_ROOT` is unset.
Set `W5_D09_ROOT` to `tools/repeat-job-binder` of that pin to reuse a
checkout.

## Remaining live steps (Root / journey owner)

1. Rebase onto a later W5-D01 execution contract when it publishes.
2. Consume W5-M01 catalog/engine selection when that export exists.
3. Bind W5-D09's later wrapper-aware binder if it stops invoking PR51
   engines as a competing executor.
4. Hosted HTTP paid route, live settlement, deploy, and field
   execution are out of this assignment. Do not treat this harness as
   those steps.
