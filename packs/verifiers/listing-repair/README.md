# Listing-repair verifier (R14-01 / SDS)

Offline Node ≥22 **oracle** for SameDayDesk `listing-repair-packet` outputs from
**useful-jobs 1.4.7**. It rejects stale, fabricated, false, or publish-attempt
packets. It does **not** run the listing-repair engine and it never posts a catalog.

Adapted from neo PR51 (`epistemedeus/neomorphic-io` @ `dbf5bac…`) with the
1.4.7 bind: packets use owner-repair **`actions[]`**, not 1.0.0 `corrections[]`.

```sh
cd packs/verifiers/listing-repair
node bin/listing-repair-verifier.mjs verify \
  --packet fixtures/ok/ok.packet.json \
  --source fixtures/ok/ok-source.json
```

Stdout is JSON: `{ ok, reasons[], packetDigest, sourceDigest, provenance, checks, honesty }`.
`checks.publish` is always `false`. `provenance.purchaseAuthority` is always `false`.
The object never contains `actual_completion`.

## Cold path (1.4.7 archive)

Preferred acquire (already in this repo):

- `client/public/kit/useful-jobs-1.4.7.tar.gz`
- sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` (5255824 bytes)

```sh
tar -xzf client/public/kit/useful-jobs-1.4.7.tar.gz -C /tmp
cd /tmp/useful-jobs-1.4.7
node bin/useful-jobs.mjs run listing-repair-packet --example
```

Captured example: `fixtures/cold/example-1.4.7.packet.json` — labelled SAMPLE /
`--example` and must **not** verify as `accepted_correction`.

## Seeded refusals

| Attempt | `reasons[]` |
| --- | --- |
| Stale `observedAt` older than packet `asOf` | `stale_observed_at` |
| Bind `observedAt` disagrees with `--source` | `source_observed_at_mismatch` |
| Newer source digest without refresh | `stale_source_digest` |
| SAMPLE / `--example` / `labelledSample` | `fabricated_sample` |
| Field not in the source snapshot | `invented_field` |
| Route ref against a snapshot with no such route | `route_ref_missing` |
| No-op fix (to-value already on source) | `false_correction` |
| Legacy `corrections[]` without `actions[]` | `legacy_corrections_shape` |
| Global unlist claim in summary or action notes | `global_unlist_claim` |
| `--publish` / live SDS write | `publish_attempted` / `live_sds_write` |

## Tests

```sh
npm test --prefix packs/verifiers/listing-repair
```
