# useful-job-desk

Caller desk for the published useful-jobs **1.4.7** archive. This pack owns
caller files and receipts. It binds and runs the real engine. It does not
rewrite `engines/` and does not reopen H32 private primitives.

Pin: `5255824` bytes, sha256
`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`.

## What it does

1. Verify the committed public archive (and kit copy when present).
2. Extract outside this pack.
3. Run owned callers through `bin/useful-jobs.mjs`.
4. Run a changed-input second pass without overwriting caller files.
5. Write an honest receipt. `delivered` requires engine exit 0 and promised
   output files as regular files. Changed-input repeats compare a stable
   output fingerprint, not a `generatedAt`-tainted digest. Repeat demand
   stays false.

Disjoint from `tests/v6-*/**`, `packs/e3-changed-data-second-run/**`, and
`packs/e4-maintained-runtime-discovery/**`.

## Commands

From the repository root:

```bash
node packs/useful-job-desk/bin/useful-job-desk.mjs pin
node packs/useful-job-desk/bin/useful-job-desk.mjs desk
node packs/useful-job-desk/bin/useful-job-desk.mjs repeat \
  --job vendor-budget-impact \
  --before packs/useful-job-desk/callers/vendor/before.json \
  --after packs/useful-job-desk/callers/vendor/after.json \
  --after-repeat packs/useful-job-desk/callers/vendor/after-repeat.json
node packs/useful-job-desk/bin/useful-job-desk.mjs verify
```

`--example` is refused (kit samples are not owned caller files).

## Seeded failure

Same fixture twice labelled repeat demand must refuse:

```bash
node packs/useful-job-desk/bin/useful-job-desk.mjs repeat \
  --job vendor-budget-impact \
  --before packs/useful-job-desk/callers/vendor/before.json \
  --after packs/useful-job-desk/callers/vendor/after.json \
  --after-repeat packs/useful-job-desk/callers/vendor/after.json \
  --label-repeat-demand
```

Expected: exit 2, `code: same-fixture-labelled-repeat-demand`, `delivered: false`.

## Tests

```bash
node --test packs/useful-job-desk/test/*.test.mjs
```
