---
name: record-repeat
description: Offline OpenAPI used-ops, price/unit row, keyed CSV, and RSS/Atom comparisons. Unpack the lean archive, run labeled samples or caller files through the shared CLI, keep unsupported or missing fields explicit, and write a next-run manifest.
---

# record-repeat

Cold-agent skill for the SameDayDesk record-repeat package.

Parser pin: `65ce1867f1b4339cc708bfb72a7d9a5942785632`  
Recipe pin: `a022eb6352156dcdcdf2f8730931f5891bd01436`

## Cold start

```bash
mkdir -p /tmp
tar -xzf record-repeat-job-*.tar.gz -C /tmp
cd /tmp/record-repeat-job
node bin/record-repeat.mjs sample --all
```

## Families

| Family | Notes |
|---|---|
| openapi-used-ops | Used-operation pin only; out-of-pin webhooks stay out of scope |
| pricing-row-unit | Curated rows with units; HTML refused |
| csv-keyed-drift | Key required; duplicate keys blocked; empty is not missing |
| rss-atom-brief | Corrections/dedup; non-feed HTML refused |

## Rules

- Labeled samples are not live caller input. Prefer `run --family` with caller paths for real work.
- Never invent rows, units, identities, or feed entries.
- Preserve `refused`, `partial`, and uncertainty fields.
- Write next-run manifests for repeat use.
- This CLI does not fetch, charge, or schedule. Optional paid extract is separate.
