# Four source comparison families

Shared CLI: `node bin/record-repeat.mjs`.

Parser pin: `65ce1867f1b4339cc708bfb72a7d9a5942785632`  
Recipe pin: `a022eb6352156dcdcdf2f8730931f5891bd01436`

| Family | Recipe samples | Honesty |
|---|---|---|
| openapi-used-ops | R-OPENAPI-PIN-IMPACT | Used-ops pin only; out-of-pin webhook edits stay out of scope |
| pricing-row-unit | R-PRICE-UNIT-CASE, R-PRICE-REFUSE-HTML | Curated rows with units; HTML refused |
| csv-keyed-drift | R-CSV-KEYED-CHANGE, R-CSV-DUP-IDENTITY, R-CSV-REAL-NEWLINE | Key required; duplicate keys block definitive counts; empty is not missing |
| rss-atom-brief | R-FEED-LIVE-NOCHANGE, R-FEED-SYNTH-CORR-DEDUP | Live no-change valid; synthetic correction labeled |

Offline processing of caller or sample artifacts. Optional paid merchant extract is a separate product and is not started by this CLI.
