# W5-M01 useful-engine composition

In-tree consumer over the transferred M02–M05 CLIs. First offer: `lockfile-pin-delta`.

```bash
node experiments/wave5/m01/bin/catalog.mjs list
node experiments/wave5/m01/bin/catalog.mjs contract
node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta \
  --before tools/lockfile-pin-delta/fixtures/journey/before.json \
  --after tools/lockfile-pin-delta/fixtures/journey/after.json \
  --out-dir /tmp/w5-m01-lock
node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs
```

Does not edit the live useful-jobs catalog, homepages, `server/paid-useful-jobs/`, or root `package.json`. D01 bind requires the small `getJob` injection in `CONTRACT.md`.
