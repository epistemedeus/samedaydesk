# Four source/record families

Shared CLI: `node bin/record-repeat.mjs`. Parsers are the S134 modules at parser pin
`65ce1867f1b4339cc708bfb72a7d9a5942785632`. Recipes/adapters/sources from S163 pin
`a022eb6352156dcdcdf2f8730931f5891bd01436`.

| Family | Recipe samples | Honesty |
|---|---|---|
| openapi-used-ops | R-OPENAPI-PIN-IMPACT | Used-ops pin only; out-of-pin webhook edits stay out of scope |
| pricing-row-unit | R-PRICE-UNIT-CASE, R-PRICE-REFUSE-HTML | Curated rows+units; HTML refused |
| csv-keyed-drift | R-CSV-KEYED-CHANGE, R-CSV-DUP-IDENTITY, R-CSV-REAL-NEWLINE | Key required; dup keys block definitive counts; empty≠missing |
| rss-atom-brief | R-FEED-LIVE-NOCHANGE, R-FEED-SYNTH-CORR-DEDUP | Live no-change valid; synthetic correction labeled |

Free offline processing of caller or sample artifacts. Optional existing paid merchant
extract is a separate product. No new price, cron, settlement, or unattended subscription.
