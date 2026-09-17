# Listing-repair verifier (R14-07 bind)

Offline Node ≥22 **oracle** bound to SameDayDesk `listing-repair-packet`
**useful-jobs 1.4.7** `repair-packet.json`. It judges the shipped envelope
(`schema`, `actions[]` with `route:` sourceRefs, `digest`, `caller`) against a
listing snapshot digest.

It does **not** invent 1.0.0 `corrections[]` or write `sourceObservation` onto
engine output. It never publishes a catalog and never republishes the kit.

```sh
cd packs/verifiers/listing-repair
node scripts/cold-bind.mjs
# kit pin + real --example / mismatch engine runs + oracle refusals

node bin/listing-repair-verifier.mjs verify \
  --packet fixtures/cold/example.packet.json \
  --source fixtures/cold/example.source.json
# ok: false, reasons: ["fabricated_sample"], accepted_correction: false
```

Stdout is JSON: `{ ok, reasons[], packetDigest, sourceDigest, provenance, checks, honesty }`.
`checks.publish` is always `false`. `provenance.purchaseAuthority` is always `false`.
The object never contains `actual_completion`.

## Cold path (1.4.7 archive, read-only)

Preferred acquire (already in this repo; **do not rebuild or republish**):

- `client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`
- sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` (5255824 bytes)
- overlay `apps/listing-repair-packet/cli.mjs` sha256 `4ccda94e10e857109377a99b52050b07ad177bb05e85ff24f0ed1d8b158ece56`

`scripts/cold-bind.mjs` extracts that archive to a temp dir, runs:

```sh
node bin/useful-jobs.mjs run listing-repair-packet --example
node bin/useful-jobs.mjs run listing-repair-packet --input samples/listing/mismatch.json
```

then verifies the engine's `repair-packet.json`.

## Seeded refusals

| Attempt | `reasons[]` |
| --- | --- |
| 1.4.7 `--example` packet | `fabricated_sample` (not `accepted_correction`) |
| `samples/listing/mismatch.json` packet | `mismatch_not_correction` |
| Mutated listing snapshot vs bind digest | `stale_source_digest` |
| Legacy `corrections[]` without `actions[]` | `legacy_corrections_shape` |
| `--publish` / live SDS URL as `--source` | `publish_attempted` / `live_sds_write` |

## Tests

```sh
npm test --prefix packs/verifiers/listing-repair
```
