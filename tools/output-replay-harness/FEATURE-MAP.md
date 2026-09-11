# Feature map — W4-commerce-04 output replay harness

| Field | Value |
| --- | --- |
| User goal | Re-run the same useful-jobs catalog job on the same caller files twice, byte-compare catalog outputs, and classify `identical` \| `labelled-drift` \| `identity-break`. SAMPLE / `--example` stays sample. |
| Entrypoint | `tools/output-replay-harness/` (`bin/replay.mjs`, `lib/replay.mjs`) |
| Command | `node tools/output-replay-harness/bin/replay.mjs --job api-upgrade-brief --before <kit>/samples/openapi/a/before.yaml --after …/after.yaml --used …/used.json --out-a /tmp/orh-a --out-b /tmp/orh-b` |
| State | `identityVerified` true only for non-SAMPLE caller replays whose catalog JSON identity holds. `purchaseAuthority` always false. Payments are not in this package. |
| Tests | `cd tools/output-replay-harness && node --test test/*.test.mjs` |
| Account prerequisite | None. Offline Node >= 22, `tar`, and the in-repo PR51 archive. No wallet, facilitator, chain, queue, or Postgres. |

## Identity rule (pinned useful-jobs 1.0.0)

Compare **catalog output filenames only**. The pinned engine writes `generatedAt` into JSON envelopes; api-upgrade-brief markdown is byte-stable. Identity JSON drops `generatedAt`. Markdown ISO timestamp chatter is not identity-break when identity JSON matches.

| Classification | Meaning |
| --- | --- |
| `identical` | Every catalog output file is raw-byte-equal |
| `labelled-drift` | Catalog JSON identity holds; remaining bytes differ only in envelope/timestamp labels |
| `identity-break` | Catalog JSON identity fails or a catalog filename is missing |

`samples/openapi/a` has no `SAMPLE.txt` and is the customer-style caller journey. `caller-alpha` / `--example` stay sample.

Pinned archive `a/after.yaml` and `b/after.yaml` are byte-identical. The seeded after.yaml swap uses `samples/openapi/caller-alpha/after.yaml`.

## Adapters / later bindings

| API | Default | Later owner |
| --- | --- | --- |
| useful-jobs CLI | Extract in-repo archive, `node bin/useful-jobs.mjs run <id>` | Root |
| `hashTermsVersion` | Isolated pin of I01 Neo PR54 `packs/funded-task-terms` (`sha256:` + 64 hex). Integer `termsVersion` is not a public claim key. | Root, after I01 is on Neo main |
| F08 paid wrappers | Not consumed | F08 |
| W2-06 cold-start | Not this package | W2-06 owner |

Do not cherry-pick original F01 occupancy kernel. This harness hashes replay terms with I01's content-hash contract only.
