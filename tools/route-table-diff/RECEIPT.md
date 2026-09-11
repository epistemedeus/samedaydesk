# RECEIPT — W4-commerce-12 SPA route-table diff

Repo: `epistemedeus/samedaydesk`
Owned path: `tools/route-table-diff/`
Feature branch: `codex/w4-commerce-12-20260911`
Starting ref: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
Feature tip: record after push (`git rev-parse HEAD` on this branch)
Integration owner: Root

## What this is

Offline catalog diff for SDS crawler-shell routes. Caller supplies before/after JSON. The job writes `route-diff.json` and `route-diff.md`. It does not edit `spa-route-shells.js`, homepages, or live listings. Payments are none (`paid=false`, `settled=false`).

## Input refs (validated at starting SHA)

| Path | Status |
| --- | --- |
| `server/lib/spa-route-shells.js` | present, read-only |
| `server/scripts/test-spa-route-shells.js` | present, read-only |
| `client/public/for-agents/useful-jobs/catalog.json` | present, read-only |
| `client/src/data/machineEntry.mjs` | present, read-only |

PUBLIC_SHELLS snapshot copied into `fixtures/public-shells-snapshot.json` (seven paths). Not a competing kernel. listing-repair-packet was read from the published useful-jobs archive as related prior art and was not copied.

I01 / Neo PR54 content-hash `termsVersion` (`sha256:` + 64 hex) is respected: integer `termsVersion` is refused. F01 occupancy kernel is not imported.

## Commands (reproducible from this PR)

Dependencies: Node >= 22 (tested v22.14.0). No extra npm packages. No env secrets. No network except optional loopback HTTP created by the test helper.

```bash
node --test tools/route-table-diff/test/*.test.mjs
node tools/route-table-diff/bin/route-diff.mjs \
  --before tools/route-table-diff/fixtures/journey/before.json \
  --after tools/route-table-diff/fixtures/journey/after.json \
  --out-dir /tmp/route-table-diff-journey
node tools/route-table-diff/bin/route-diff.mjs --example --out-dir /tmp/route-table-diff-sample
```

## Test counts

`node --test tools/route-table-diff/test/*.test.mjs`

14 passed, 0 failed.

## Caller journey (executed)

Before has `/for-agents/useful-jobs`. After adds `/for-agents/useful-jobs/v2`. Diff lists that added path. `/terms` canonical `https://samedaydesk.com/terms` -> `https://samedaydesk.com/legal/terms` is `changed` with field `canonical`. Journey after also sets `/privacy` robots to `noindex,follow`, listed as `changed` with field `robots`. `publishedRouteTable` stays false.

## Seeded failures (executed)

| Case | Code |
| --- | --- |
| Homepage rewrite claim / `--rewrite-homepage` / path `/` | `homepage_rewrite_refused` |
| SAMPLE + `--published` / `--example --published` / SAMPLE claiming published | `sample_not_published_route_table` |
| Path-less record | `pathless_record` |
| Integer `termsVersion` | `integer_terms_version_refused` |
| `https://samedaydesk.com/...` catalog | `external_catalog_refused` |

`--example` SAMPLE pair diffs successfully and stays unpublished.

## Evidence classes

| Class | Exercised |
| --- | --- |
| fixture | `--example`, PUBLIC_SHELLS snapshot compare |
| caller | journey files on disk |
| local-runtime | sibling-process `127.0.0.1` HTTP server + CLI fetch |
| external | refused, not accepted |

## Honestly untested

- Production `https://samedaydesk.com` route table fetch (refused by design).
- Postgres. This job has no catalog store; a database would be invented API.
- Live writeback into `spa-route-shells.js` (forbidden).
- Binding to listing-repair-packet or I01 `hashTermsVersion` (siblings unbound; adapters recorded).
- Account-shell robots catalog beyond the journey `/privacy` robots change.
- Concurrent writers, huge catalogs, non-JSON HTML inputs.

## Next integration owner

Root. Suggested later binding: inject a read-only PUBLIC_SHELLS exporter without editing the generator. Do not merge this module into homepage or shell writers.
