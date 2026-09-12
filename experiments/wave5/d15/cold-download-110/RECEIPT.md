# W5-D15 RECEIPT — cold-download-110

**Date:** 12 September 2026
**Assignment:** Cold-customer verification of public useful-jobs 1.1.0
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d15-deterministic-input-execute-race-harness-4fc6`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/75
**Owned path:** `experiments/wave5/d15/cold-download-110/`
**No product edits.** D01 still holds integration.

## Pins

| Role | Value |
| --- | --- |
| D01 public kit | `5579cfde782a060de42420ac904fe45372227ce8` (PR74, `codex/w5-d01-20260911`) |
| Archive core (not re-audited here) | `d2a0d0b2798e9a3951c43fe16dd64215207c3d9b` |
| H04 extra corpus | `7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc` |
| Packaged H04 examples | `37dd4b42cf21dc2031715971971bb2426a7beb80` |

## Public archive bytes

| Artifact | Bytes | sha256 |
| --- | --- | --- |
| `useful-jobs-1.1.0.tar.gz` | 2577606 | `de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534` |
| `useful-jobs-1.0.0.tar.gz` | 2522418 | `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |

1.0.0 remains byte-unchanged. Extract and run used `/tmp/d15-cold-customer*` and `/tmp/d15-cold-inputs`, not the git checkout. Child env has `HOME=/tmp/d15-cold-home` and no Pilot/Cursor/catalog/API keys.

## Ordinary command (from archive README)

```bash
cd useful-jobs-1.1.0
node bin/useful-jobs.mjs list
node bin/useful-jobs.mjs version   # useful-jobs 1.1.0
node bin/useful-jobs.mjs run lockfile-pin-delta \
  --before ./samples/lockfile/h04-pub-lock-01/before.json \
  --after ./samples/lockfile/h04-pub-lock-01/after.json \
  --out-dir ./out/h04-lock
```

This consumer used that entry (`node bin/useful-jobs.mjs`) with independent files under `/tmp/d15-cold-inputs`. Repo-tree `server/paid-useful-jobs/bin/deliver.mjs` was not the cold-customer path.

Kit ships MIT `LICENSE`, `NOTICE`, `licenses/vendor/`, `catalog.json` 1.1.0 with ten jobs, `jobs-outcomes.json`, `bin/useful-jobs.mjs`, `apps/<id>/cli.mjs`, four M01 engines, `vendor-pins/PIN.json`. Node `>=22`. Help does not advertise `--timeout`. Nested `runNodeJson` 60s is internal, not a caller switch.

## Counts

| Bucket | Count | Notes |
| --- | --- | --- |
| Independent positives | **24** | Process success + advertised outputs + `purchaseAuthority: false` |
| Independent negatives | **12** | Exit 2 supported refusals |
| H04 extra (not independent) | **3** | lock-02, lock-03, page-02 |
| Analysis defect (unknown listing provider) | **1** | Incomplete capture with `provider: "d15cold"` is `actionable`, not `partial` |
| Fixture `--example` | **1** | Funding/sample, not payment, not independent |
| Legacy 1.0.0 still runs | **1** | Independent vendor-budget change on the 1.0.0 archive |
| Harness tests | **25 pass / 0 fail** | `node --test experiments/wave5/d15/cold-download-110/test/*.test.mjs` |
| Race tests (untouched) | **20 pass / 0 fail** | `node --test experiments/wave5/d15/test/*.test.mjs` |

Independent positives are the ten advertised jobs with fresh inputs: no-change and useful-change for each job (20), plus listing incomplete-capture `partial`, listing identity-mismatch analysis `refused` (exit 0), evidence fail-decision (exit 0), and repeat missing-files informational.

Independent negatives (exit 2): html lockfile, JSON OpenAPI on webhook-drift (`not-this-job-openapi`), `--rewrite-homepage`, page `--example` (`sample_as_delivered_watch`), missing `--used` / `--after` / `--input` / `--next-run` as advertised, foreign evidence schema, repeat `input-digest-mismatch`, truncated page after JSON (`unrecognized_batch_artifact`), missing lockfile flags.

`--example` lockfile: exit 0, fixture provenance, `purchaseAuthority` false, `sold` not true.

## Decisive cases

| Case | Expected | Observed |
| --- | --- | --- |
| Cwd with spaces (`/tmp/d15-cold-runs/cwd with spaces/useful-jobs-1.1.0`, relative `./before.json` / `./out lock`) | Ordinary command works | Exit 0, `actionable`, outputs in `./out lock` |
| Page `before`/`after` as `../page-sentinels/…` | Relative to job document | Exit 0, verdict `changed`. Trusted-local: `..` is ordinary `path.resolve`, not a sandbox |
| Absolute sentinel paths | Held local files | Exit 0, verdict `changed` |
| Symlink sentinels in `/tmp` only | Follow symlink | Exit 0, verdict `changed` |
| Parallel distinct `--out-dir` | Receipts bind to each order | `left-pad` only in `parallel-a`, `once` only in `parallel-b`, digests differ |
| Missing advertised output after green run | Both listed files exist | `pin-delta.{json,md}` and peers present on every process-success |
| Truncated after JSON | Refuse, no full brief | Exit 2, `unrecognized_batch_artifact` |
| Caller `--timeout` | Only if advertised | **Unsupported.** Help/catalog/README have no `--timeout` |
| Nonzero | Exit 2 for declared refuse | Exit 2 for missing inputs and advertised refuse codes |
| 1.0.0 | Still works, bytes unchanged | `useful-jobs 1.0.0`, six jobs, independent budget change exit 0 |

## Reproducible analysis findings (not process crashes)

These are analysis-validity notes. Process still succeeded where listed.

1. **Listing provider enum.** Advertised incomplete current capture is `partial` when `identity.provider` is `grexal` or `agensi`. The same incomplete snapshot with `provider: "d15cold"` returned **`actionable`**.

```bash
# expected: status partial (incomplete current cannot prove removal)
# observed: status actionable
node bin/useful-jobs.mjs run listing-repair-packet \
  --input /tmp/d15-cold-inputs/listing/partial.json \
  --out-dir /tmp/d15-cold-runs/listing-partial
# grexal + captureIncomplete: {"ok":true,"status":"partial",...}
```

Unknown-provider variant (same capture flags, `provider: "d15cold"`): expected `partial`, observed `actionable`. Nested kit `PROVIDERS` is `grexal|agensi`. Not a crash. Not a payment.

2. **Listing identity mismatch** is analysis `refused` with **exit 0**, not process exit 2. Sample `samples/listing/mismatch.json` is the same. Missing `--input` is the process refusal (`missing-required-inputs`, exit 2).

3. **Webhook-drift OpenAPI.** JSON OpenAPI refuses `not-this-job-openapi` (exit 2). YAML OpenAPI refuses `not-json` (exit 2, no YAML parser). Both are supported refusals; only JSON hits the advertised OpenAPI code.

4. **Page relative `..`.** CALLER.md says paths are relative to the job document. They resolve with `path.resolve(jobDir, value)`, so `..` and absolute paths read any local sentinel. Not multi-tenant confinement. Harmless `/tmp` sentinels only were used.

## Separations

| Claim | Result |
| --- | --- |
| Supported refusal vs defect | Exit 2 codes above are refusals. No engine crash on these inputs. |
| Fixture funding vs payment | `--example` and `samples/` stay SAMPLE/fixture. `purchaseAuthority` never true. `sold` not true. |
| Analysis vs process | Evidence fail-decision and listing mismatch can be analysis `refused` with process exit 0. Missing flags are process exit 2. |
| Timeout | Not a product defect. Caller timeout is not advertised. |

## Tests

```bash
node --test experiments/wave5/d15/cold-download-110/test/*.test.mjs
```

PASS 25 tests, 0 fail, 0 skipped. Node v22.14.0. Postgres not required. No network/model/payment calls during analysis.

No homepage, wrapper, spend, or deploy in this PR. Sol Pro source review on `d2a0d0b2` was not duplicated.
