# Repeat-job binder

Catalog-facing binder for a verified `repeat-job.json` (or next-run manifest)
plus new local input files. Binds `openapi-used-ops` or `pricing-row-unit`,
runs the published useful-jobs CLI or vendor-pin record-repeat, and writes a
second-run record.

Not a scheduler daemon. Never cron install. SAMPLE is not live recurrence.
Payments are nonsettling prototypes; this tool has no pay path.

```bash
cd tools/repeat-job-binder
node bin/bind.mjs --ticket ./repeat-job.json \
  --before ./before.json --after ./after.json \
  --declare-after-sha256 <64-hex> \
  --out-dir ./out/second
```

Requires Node >= 22 and the PR51 archives already on this repository.
See FEATURE-MAP.md and RECEIPT.md.
