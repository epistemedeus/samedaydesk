---
name: record-repeat
description: Offline source/record repeat jobs for OpenAPI used-ops, pricing row/unit, keyed CSV, and RSS/Atom. Unpack the lean archive, run free samples or caller inputs through the shared CLI, keep honest partial/unsupported cases, and write a next-run manifest without a private workspace.
---

# record-repeat

Cold-agent skill for the SameDayDesk **record-repeat** acquisition package (S176).

Parser pin: `65ce1867f1b4339cc708bfb72a7d9a5942785632` (S154 tip of S134 CLIs).  
Recipe pin: `a022eb6352156dcdcdf2f8730931f5891bd01436` (S163).  
Do **not** fetch or rewrite the Bot record kit. Do **not** use cell ids native05..08.

## Cold start

```bash
mkdir -p /tmp/record-repeat-job
tar -xzf record-repeat-job-*.tar.gz -C /tmp
cd /tmp/record-repeat-job
npm ci
node bin/record-repeat.mjs sample --all
```

## Families

| Family | Parser module | Notes |
|---|---|---|
| openapi-used-ops | openapi-impact | Used-operation pin only; out-of-pin webhooks stay out of scope |
| pricing-row-unit | pricing-table-change | Curated rows with units; HTML refused |
| csv-keyed-drift | csv-drift | Key required; duplicate keys blocked; empty≠missing |
| rss-atom-brief | rss-atom-brief | Corrections/dedup; non-feed HTML refused |

## Rules

- Free offline processing ≠ optional existing paid extract service.
- Never invent rows, units, identities, or feed entries.
- Preserve `refused`, `partial`, and uncertainty fields.
- Write next-run manifests for repeat use; do not require a private workspace.
- No cron, no new pricing, no settlement, no unattended subscription.
