# S176 RESULT — source/record repeat-job acquisition package

Branch: `codex/s176-record-repeat-package-20260910`
Head: `faa7fb281bccb2a1d255be0e973742d49b8a765e`
Parser pin (S154 tip): `65ce1867f1b4339cc708bfb72a7d9a5942785632`
Recipe pin (S163 tip): `a022eb6352156dcdcdf2f8730931f5891bd01436`
Bot record kit: out of scope (not fetched/rewritten)

## Outcome

Cold agent can discover a concrete source-comparison job, download one portable
package, use labeled free samples or caller-bounded local inputs, run the shared
CLI, receive source-linked structured results with honest partial/unsupported
cases, and write a next-run manifest without a private workspace.

## Package

- Owning tree: `experiments/s176-record-repeat-package/`
- Overlay mirror: `overlays/s176-record-repeat-acquisition/`
- Archive: `client/public/kit/record-repeat-job-2b80f38a4e5e.tar.gz`
- sha256: `addda45cf19dcbddbbf370b8b92d993b49b50a203c3a8a6f5f07f7a13b60eab7`
- bytes: 1253701
- Discovery: `client/public/discovery/record-repeat.json` → real kit path
- Inner page: `/for-agents/record-repeat` (homepage identity untouched)
- Shared CLI: `bin/record-repeat.mjs` over S134 parsers (no second engine)

## Families

| Family | Sample recipes |
|---|---|
| openapi-used-ops | R-OPENAPI-PIN-IMPACT |
| pricing-row-unit | R-PRICE-UNIT-CASE, R-PRICE-REFUSE-HTML |
| csv-keyed-drift | R-CSV-KEYED-CHANGE, R-CSV-DUP-IDENTITY, R-CSV-REAL-NEWLINE |
| rss-atom-brief | R-FEED-LIVE-NOCHANGE, R-FEED-SYNTH-CORR-DEDUP |

## Verification

- S134 owning suite: 41/41
- S163 recipe suite: 6/6
- S176 acquisition suite: 14/14 (includes refuse/next-run/hygiene)
- Clean unpack outside workspace + `sample --all` + next-run replay: pass
- Archive hygiene: no `/workspace` leaks, secrets, or transcripts
- Client build + route shell `/for-agents/record-repeat`: pass
- Browser QA desktop 1440: pass
- Browser QA mobile 390: pass
- Browser QA width 320: pass (`mobile.mjs --viewport 320x720`)
- Native useful cells S176-N01 (CLI refuse/next-run) + S176-N02 (archive hygiene): exit 0
- Peak concurrent Heavy children: 2; bot native05..08 excluded; no filler

## Cold start

```bash
curl -fsSL -o record-repeat-job.tar.gz https://samedaydesk.com/kit/record-repeat-job-2b80f38a4e5e.tar.gz
mkdir -p /tmp && tar -xzf record-repeat-job.tar.gz -C /tmp
cd /tmp/record-repeat-job
node bin/record-repeat.mjs sample --all
```

## Boundaries honored

- Free offline processing ≠ optional existing paid extract
- No new pricing / demand / settlement / unattended subscription
- No server cron
- Unsupported HTML and missing identity/units stay explicit
- No private paths, secrets, or transcripts in the archive
- Bot native05..08 excluded
- No merge/deploy in this session
