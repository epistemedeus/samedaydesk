# W5-M07 independent lock fixtures

Replay these fixtures on the current Co11 lockfile pin-delta CLI. Do not treat this tree as a second comparison kernel.

```bash
cd experiments/wave5/m07
node --test --test-concurrency=1 test/*.test.mjs
node bin/replay.mjs
```

`PIN.json` names the engine SHA. Tests fetch that commit into a read-only worktree when `LOCKFILE_PIN_DELTA_ROOT` is unset. A missing engine fails. It is not skipped.

Claimed engine formats are npm `package-lock.json` lockfileVersion 2 and 3. Other manager locks in `fixtures/` are independent domain cases. The current engine must refuse them with an explained code.

W5-M03 owns `tools/lockfile-pin-delta/`. W5-M01 owns catalog wiring.
