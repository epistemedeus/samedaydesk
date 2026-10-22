# FEATURE-MAP — job artifact provenance export

SameDayDesk-only zip + JSONL export for a completed useful-jobs `--out-dir`, plus import of that same zip. Not result-reuse. Not a new protocol. Not a settled sale.

## User goal

Take files a useful-jobs CLI already wrote, pack them with per-file `sha256:` digests, the catalog `jobId`, the useful-jobs archive pin, SAMPLE/sale provenance, and an I01 content-hash `termsVersion`. Import must consume the zip bytes that were advertised. A caller hash or known job id cannot replace the bytes actually read.

## Entrypoint

| Surface | Path |
| --- | --- |
| CLI | `tools/job-artifact-export/bin/export.mjs` (`export`, `import`) |
| Library | `lib/export.mjs` (`exportJobArtifacts`), `lib/import.mjs` (`importJobArtifacts`) |
| Contract | `lib/contract.mjs` |
| Hash adapter | `lib/hash-terms.mjs` (default pin `vendor/funded-task-terms-hash/`) |
| Catalog | `client/public/for-agents/useful-jobs/catalog.json` (published SDS main) |
| Kit pin | `client/src/data/usefulJobsKit.json` |
| D03 completeness | injected `verifyComplete` from `tools/job-output-atomicity` at `58cba6324c1d9793d344bc13154b8b2380e8166f`. Not vendored. |

## Command

```bash
node tools/job-artifact-export/bin/export.mjs export --in-dir <job-out-dir> --out <dir>
node tools/job-artifact-export/bin/export.mjs import --zip <job-artifacts.zip> --out <dir> [--zip-sha256 sha256:<hex>]
```

Writes `<dir>/job-artifacts.zip`, `<dir>/job-artifacts.zip.sha256`, `<dir>/files.jsonl`, `<dir>/manifest.json`. Zip also contains those metadata files plus the original job files.

`--archive-sha256` is a claim. It must match the sha256 of the useful-jobs tar.gz bytes on disk. `--job-id` must correspond to the catalog outputs actually present. `--as customer-delivery` is always refused. SAMPLE cannot be relabeled `sale`. Per-file cap is 8MiB.

Import hashes the zip bytes it reads, then parses that same buffer. A sidecar or `--zip-sha256` must match. Catalog job/output correspondence is checked again. Valid SAMPLE / no-change analysis is still a successful bundle, not a transport failure.

## State / labels

| Label | Meaning |
| --- | --- |
| `SAMPLE` | Example/sample/fixture signals (`--example`, `samples/`, `SAMPLE` filenames, `SAMPLE fixture` text). |
| `sale` | Caller out-dir without those signals. Still `customerDelivery: false`, `notSettling: true`. Fixture until a job engine stops SAMPLE-stamping ICS. |
| `customer-delivery` | Never emitted. Seeded refuse. |

`termsVersion` and `enginePin` are `sha256:` + 64 lowercase hex (I01 / Neo PR54). `schemaVersion` is the integer shape version `1`. Integer `termsVersion` is rejected. Unlike terms schemas are not forced equal.

## Tests

```bash
node --test tools/job-artifact-export/test/*.test.mjs
```

| Class | Case |
| --- | --- |
| local-runtime | PR51 useful-jobs `feed-agenda` on archive `samples/feed/a` → export → unzip matching sha256 |
| local-runtime | that SAMPLE out-dir + `--as customer-delivery` refuses |
| local-runtime | SAMPLE no-change `status=informational` export then import of the same zip bytes |
| CLI | `--archive-sha256` that is not the on-disk archive refuses `archive-identity-override` |
| CLI | known `--job-id` with another job's files refuses `job-output-mismatch` |
| CLI | import with the wrong `--zip-sha256`, mutated zip, or swapped zip refuses `zip-bytes-mismatch` |
| process | D03 `verify-complete` at pin `58cba632` on an imported useful-jobs dir is `missing-receipt` / not paid complete |
| fixture | SAMPLE + customer-delivery, file over 8MiB, empty in-dir, SAMPLE `--label sale` |

## Account prerequisite

None. Offline Node >= 22. Tests also need `tar`, `unzip`, and git fetch of the D03 pin for the completeness process test. No Postgres, HTTP, payment, or mailbox.

## Later integration (W5-D01)

- D03 `verifyComplete` still requires an F08 `receipt.json`. A Co15 zip of a raw useful-jobs out-dir is correspondence-complete for catalog outputs, not D03 `classification=complete`.
- Inject live `@neomorphic/funded-task-terms/hash` (`hashTermsVersion`) when Neo PR54 lands in a consumer; do not copy `services/earned-work`.
- useful-jobs 1.0.0 `feed-agenda` hardcodes `SAMPLE fixture` in ICS even for caller files, so a true local-runtime `sale` label is blocked until that engine changes.
- Bind artifact `sha256:` rows to earned-work `artifact.digestSha256` if a money path needs them. This pack does not pay.
