# W5-M01 selected engine catalog

Thin catalog and invoker for D01. First offer: `lockfile-pin-delta`.

```bash
node experiments/wave5/m01/bin/catalog.mjs list
node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs
```

Does not copy M02–M05 kernels. Tests materialize those owned paths from the pins in `catalog.json` via `git archive`. Licenses stay with those packages.

Live useful-jobs catalog and homepages are not edited.
