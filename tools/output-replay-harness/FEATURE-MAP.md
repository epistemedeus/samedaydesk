# Feature map — W5-D10 output replay harness

| Field | Value |
| --- | --- |
| User goal | Re-run the same useful-jobs catalog job on the same caller files twice, byte-compare catalog outputs from disjoint directories, and classify `identical` \| `labelled-drift` \| `identity-break`. SAMPLE / `--example` stays sample. |
| Entrypoint | `tools/output-replay-harness/` (`bin/replay.mjs`, `lib/replay.mjs`) |
| Command | `node tools/output-replay-harness/bin/replay.mjs --job api-upgrade-brief --before <kit>/samples/openapi/a/before.yaml --after …/after.yaml --used …/used.json --out-a /tmp/orh-a --out-b /tmp/orh-b` |
| State | `identityVerified` true only for non-SAMPLE caller replays whose catalog JSON identity holds and classification is not `identity-break`. `purchaseAuthority` always false. Payments are not in this package. |
| Tests | `cd tools/output-replay-harness && node --test test/*.test.mjs` |
| Account prerequisite | None. Offline Node >= 22, `tar`, and the in-repo PR51 archive. No wallet, facilitator, chain, queue, or Postgres. |

## Published comparison contract

Exported from `index.mjs`:

| Export | Behavior |
| --- | --- |
| `assertDisjointOutputDirs(outA, outB)` | Resolves each path (`realpath`, `dev`+`ino`). Refuses `overlapping-output-dirs` when they are the same location, including symlink aliases. |
| `captureCatalogOutputs(outDir, outputNames)` | Copies catalog file bytes immediately. Later mutation of the live directory cannot change the capture. |
| `compareCatalogOutputs({ captureA, captureB, outputNames })` | Classifies from captures (or live dirs if captures omitted). |

## Identity rule (pinned useful-jobs 1.0.0)

Compare **catalog output filenames only**, from the bytes captured after each run. The pinned engine writes `generatedAt` into JSON envelopes; api-upgrade-brief markdown is byte-stable on the same input. Identity JSON drops `generatedAt`. Markdown ISO timestamp chatter is labelled-drift, not proof that the documents are equivalent. Other markdown body differences are identity-break.

| Classification | Meaning |
| --- | --- |
| `identical` | Every catalog output file is raw-byte-equal |
| `labelled-drift` | Catalog JSON identity holds; remaining byte diffs are only envelope `generatedAt` and/or markdown ISO timestamps |
| `identity-break` | Catalog JSON identity fails, a catalog filename is missing, or a non-JSON body differs beyond timestamp chatter |
| `overlapping-output-dirs` | Valid refusal: `--out-a` and `--out-b` are the same location |

`samples/openapi/a` has no `SAMPLE.txt` and is the customer-style caller journey. `caller-alpha` / `--example` stay sample.

Pinned archive `a/after.yaml` and `b/after.yaml` are byte-identical. The seeded after.yaml swap uses `samples/openapi/caller-alpha/after.yaml`.

## Adapters / later bindings

| API | Default | Later owner |
| --- | --- | --- |
| useful-jobs CLI | Extract in-repo archive, `node bin/useful-jobs.mjs run <id>` | Root / D01 if a shared wrapper export is selected |
| `hashTermsVersion` | Isolated pin of I01 Neo PR54 `packs/funded-task-terms` (`sha256:` + 64 hex). Integer `termsVersion` is not a public claim key. | Root, after I01 is on Neo main |
| F08 paid wrappers | Not consumed. Tested against SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` as a pin only. | D01 |
| W2-06 cold-start | Not this package | W2-06 owner |

Do not cherry-pick original F01 occupancy kernel. This harness hashes replay terms with I01's content-hash contract only. Do not force unlike terms hashes equal.
