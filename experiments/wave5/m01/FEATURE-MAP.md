# FEATURE-MAP — W5-M01 engine catalog for D01

SameDayDesk Wave5 catalog owner. Writes only `experiments/wave5/m01/`.

## Caller goal

Publish one selected-engine catalog D01 can consume. First advertised analysis offer is **lockfile-pin-delta**. Schema, route, and page-change stay selected but are not the first SKU. SDS52's six useful-jobs remain the existing wrapper; this package does not edit the live catalog or `server/paid-useful-jobs/`.

## Entrypoint

| Item | Value |
| --- | --- |
| Contract | `experiments/wave5/m01/catalog.json` |
| Export | `experiments/wave5/m01/index.mjs` (`loadCatalog`, `invokeEngine`) |
| CLI | `node experiments/wave5/m01/bin/catalog.mjs list\|describe\|invoke` |
| Tests | `node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs` |

`invoke` spawns the pinned engine CLI and checks promised stdout/stderr plus output files. It is not a second paid runner and does not settle.

## Pins tested here

| Engine | Owner | Pin | Outputs |
| --- | --- | --- | --- |
| lockfile-pin-delta (first offer) | W5-M03 | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | `pin-delta.json`, `pin-delta.md` |
| json-schema-webhook-drift | W5-M02 | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | `drift-brief.json`, `drift-brief.md` |
| route-table-diff | W5-M04 | `7387eb677abd442dfab9081cb0ad95451fd2a762` | `route-diff.json`, `route-diff.md` |
| page-change-offline-job | W5-M05 | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | `page-change.json`, `page-change.md` |

Wrapper contrast: SDS52 `aeef964fa188443078958d9d6d393afae1d542ee`.

## Outcome kinds

| Kind | Meaning |
| --- | --- |
| `analysis` | Engine exited 0, stdout `ok:true`, promised files exist. Status may be actionable, informational, partial, unchanged, or incomplete. |
| `refused` | Engine refused on the stream named in the catalog. Valid product output. |
| `incomplete-delivery` | Transport looked successful but a promised output file is missing. |
| `transport-failure` | Crash, missing binary, or non-JSON. Not a domain verdict. |

Page-change refusals on this pin are **stderr** `{ok:false,code,message}`. The other three refuse on stdout with `refused:true`.

## Remaining integration

D01 has not imported this catalog into `runPaidOffer`. M02–M05 may amend engine semantics; consumers must re-pin. Do not force `tableDigest` equality for route permutations, or terms hashes across unlike schemas.
