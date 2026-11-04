# AGL decision transfer

This branch stops at a missing seam. It does not grant, export, or record `useVoluntary`.

Synthetic participant A can produce `out/bound-observation.json` with the harbor catalog workflow. `result.transfer.command` is the prepared later call. That command is not executable. `transferCommand` reads `horizonHours` from the result identity, and the identity stores task, subject, sequence, and clock only. The prepared command therefore contains `--horizon` `undefined`. `tools/result-reuse/cli.mjs` rejects that token before it reads the saved decision.

The two placeholders in the command are the before-work manifest and `bound-observation.json`. Filling those placeholders and running the remaining tokens in a separate process exits 1. A distinct participant cannot reuse the decision through the prepared command, so the disposable host journey was not started.

The live public profile and accepted-work list were read and are recorded in `HANDBACK.md`. They are not the disposable-host source default.

## Check

```sh
node --test --test-concurrency=1 experiments/agl-decision-transfer-20261104/test/decision-transfer.test.mjs
```

The test asserts that the prepared command returns verdict `reuse` with the producer uninvoked. It fails on the horizon token.
