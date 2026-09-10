# NL-DISTRIBUTION-06 — Conversion diagnosis join with Record route regression

Scope: `experiments/scale-r2-20260910/distribution/nl-06-join-record/`  
Repo: `epistemedeus/samedaydesk` · Branch: `codex/nl-distribution-06-join-record-20260910`

## Outcome

Join **NL-RECORD-04** route-repair feed into **DIST-08** conversion diagnosis:

- Join **only source-compatible** events (`provider` / `jobRef` / `sharedEvidenceId`)
- **Gaps explicit** (incomplete capture, cannot_prove_global_removal, fixture-derived acquisition, no revenue)
- **No revenue invention**; click ≠ conversion; unavailable ≠ no_users
- S172 tip already saved — **no overlap** with first-use adapter work

## Pins

| Ref | SHA |
| --- | --- |
| DIST-08 | `ea000772cdbd6d5df7174369dcef9aa2270e5723` |
| Record04 export | `8b8e44376e9414f540483a526b048beb9e4dc370` |
| S172 (done, no overlap) | `ea2938cfa68dadbe20a9d5ec096f315e59f4cdbe` |

Imported contracts/fixtures under `fixtures/` + `imports/` (Record04 / DIST-08 trees not mutated).

## Fresh consumer

```sh
# from repo root
npm run test:nl-distribution-06

node experiments/scale-r2-20260910/distribution/nl-06-join-record/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/nl-06-join-record/src/cli.mjs join \
  experiments/scale-r2-20260910/distribution/nl-06-join-record/fixtures/dist-repair-feed.positive.json
node experiments/scale-r2-20260910/distribution/nl-06-join-record/src/cli.mjs bundle \
  experiments/scale-r2-20260910/distribution/nl-06-join-record/fixtures/dist-repair-feed.positive.json
```

Requires sibling `experiments/scale-r2-20260910/distribution/08` (DIST-08 diagnose). Override with `DIST08_ROOT`.

## Schemas

| Doc | Schema |
| --- | --- |
| Record04 feed | `pilot.nl.record.dist_repair_feed.v1` |
| DIST-08 bundle | `pilot.r2.distribution.conversion_bundle.v1` |
| DIST-08 diagnosis | `pilot.r2.distribution.conversion_diagnosis.v1` |
| Join result | `pilot.nl.distribution.join_record_result.v1` |

## Hard stops

- No CloudAgent / paid invoke / Grexal-Agensi login mutations
- No invented SEO / traffic / ranking / revenue
- Fixture-derived acquisition is **join wiring only**, not live users
