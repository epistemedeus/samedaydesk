# RECEIPT — W5-M04 SPA route-table comparison

Repo: `epistemedeus/samedaydesk`
Owned path: `tools/route-table-diff/`
Feature branch: `cursor/w5-m04-co12-route-table-comparison-faa0`
Starting ref: W4-commerce-12 `7387eb677abd442dfab9081cb0ad95451fd2a762`
Implementation: `386b8f9fc4745afdc520d1e650d520280936eb39`
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/88
Wave5 receipt: `experiments/wave5/m04/RECEIPT.md`
Contract: `CONTRACT.md`
Integration owner: W5-M01

## What this is

Offline catalog comparison for SDS crawler-shell routes. Caller supplies before/after JSON. The job writes `route-diff.json` and `route-diff.md`. It does not edit `spa-route-shells.js`, homepages, or live listings. Payments are none (`paid=false`, `settled=false`).

Permutation of the same SDS routes is not a breaking change. Path/canonical collision after SDS identity, or removal of a route, is breaking. Those findings are analysis outcomes (`ok: true`, exit 0). Transport and unsupported-schema refusals stay exit 2.

## Input refs (validated)

| Path / ref | Status |
| --- | --- |
| `server/lib/spa-route-shells.js` | present, read-only |
| `server/scripts/test-spa-route-shells.js` | present, read-only |
| SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` | read-only. Wrapper does not invoke this engine. |

PUBLIC_SHELLS snapshot remains `fixtures/public-shells-snapshot.json`. Integer `termsVersion` is refused. F01 occupancy kernel is not imported.

## Commands

Dependencies: Node >= 22 (tested v22.14.0). No extra npm packages. No env secrets. No network except optional loopback HTTP created by the test helper.

```bash
node --test tools/route-table-diff/test/*.test.mjs
node tools/route-table-diff/bin/route-diff.mjs \
  --before tools/route-table-diff/fixtures/journey/before.json \
  --after tools/route-table-diff/fixtures/journey/after.json \
  --out-dir /tmp/route-table-diff-journey
node tools/route-table-diff/bin/route-diff.mjs \
  --before tools/route-table-diff/fixtures/journey/before.json \
  --after tools/route-table-diff/fixtures/comparison/permuted.json \
  --out-dir /tmp/route-table-diff-perm
```

## Test counts

`node --test tools/route-table-diff/test/*.test.mjs`

23 passed, 0 failed, 0 skipped.

## Comparison proof (executed)

| Case | Result |
| --- | --- |
| Reverse-order copy of journey before | `breaking=false`, `outcome=permutation`, equal `tableDigest` |
| After drops `/privacy` | `breaking=true`, `removed` includes `/privacy`, exit 0 |
| After has two `/terms` records | `ok=true`, `breaking=true`, path collision, not exit 2 |
| Trailing-slash / `:443` aliases of the same routes | `outcome=no-change`, equal digest |
| Encoded hyphen path plus decoded path | path collision, breaking |
| Two paths, one canonical | canonical collision, breaking |
| OpenAPI `paths` map / method+handler record | `unsupported_catalog`, exit 2 |
| Journey add + canonical/robots | `outcome=changed`, `breaking=false` |

## Seeded failures (executed)

| Case | Code |
| --- | --- |
| Homepage rewrite claim / `--rewrite-homepage` / path `/` | `homepage_rewrite_refused` |
| SAMPLE + `--published` / `--example --published` / SAMPLE claiming published | `sample_not_published_route_table` |
| Path-less record | `pathless_record` |
| Integer `termsVersion` | `integer_terms_version_refused` |
| `https://samedaydesk.com/...` catalog | `external_catalog_refused` |
| OpenAPI / framework catalog | `unsupported_catalog` |

## Honestly untested

- Production `https://samedaydesk.com` route table fetch (refused by design).
- Postgres. This job has no catalog store.
- Live writeback into `spa-route-shells.js` (forbidden).
- Binding to listing-repair-packet, I01 `hashTermsVersion`, or PR52 wrapper (siblings unbound).
- Concurrent writers, huge catalogs, non-JSON HTML inputs.

## Next integration owner

W5-M01. Inject a read-only PUBLIC_SHELLS exporter without editing the generator. Do not merge this module into homepage or shell writers. Do not claim PR52 wrapper behavior from this pin.
