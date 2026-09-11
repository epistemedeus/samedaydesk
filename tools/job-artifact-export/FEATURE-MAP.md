# FEATURE-MAP — job artifact provenance export

SameDayDesk-only zip + JSONL export for a completed useful-jobs `--out-dir`. Not result-reuse. Not a new protocol. Not a settled sale.

## User goal

Take files a useful-jobs CLI already wrote, pack them with per-file `sha256:` digests, the catalog `jobId`, the useful-jobs archive pin, SAMPLE/sale provenance, and an I01 content-hash `termsVersion`.

## Entrypoint

| Surface | Path |
| --- | --- |
| CLI | `tools/job-artifact-export/bin/export.mjs` |
| Library | `tools/job-artifact-export/lib/export.mjs` (`exportJobArtifacts`) |
| Hash adapter | `lib/hash-terms.mjs` (default pin `vendor/funded-task-terms-hash/`) |
| Catalog | `client/public/for-agents/useful-jobs/catalog.json` (published SDS main) |
| Kit pin | `client/src/data/usefulJobsKit.json` |

## Command

```bash
node tools/job-artifact-export/bin/export.mjs export --in-dir <job-out-dir> --out <dir>
```

Writes `<dir>/job-artifacts.zip`, `<dir>/files.jsonl`, `<dir>/manifest.json`. Zip also contains those metadata files plus the original job files.

`--as customer-delivery` is always refused. SAMPLE cannot be relabeled `sale`. Per-file cap is 8MiB.

## State / labels

| Label | Meaning |
| --- | --- |
| `SAMPLE` | Example/sample/fixture signals (`--example`, `samples/`, `SAMPLE` filenames, `SAMPLE fixture` text). |
| `sale` | Caller out-dir without those signals. Still `customerDelivery: false`, `notSettling: true`. Fixture until a job engine stops SAMPLE-stamping ICS. |
| `customer-delivery` | Never emitted. Seeded refuse. |

`termsVersion` and `enginePin` are `sha256:` + 64 lowercase hex (I01 / Neo PR54). `schemaVersion` is the integer shape version `1`. Integer `termsVersion` is rejected.

## Tests

```bash
node --test tools/job-artifact-export/test/*.test.mjs
```

| Class | Case |
| --- | --- |
| local-runtime | PR51 useful-jobs `feed-agenda` on archive `samples/feed/a` → export → unzip matching sha256 |
| local-runtime | that SAMPLE out-dir + `--as customer-delivery` refuses |
| fixture | SAMPLE fixture + `--as customer-delivery` refuses |
| fixture | file over 8MiB refuses |
| fixture | empty in-dir refuses |
| fixture | constructed sale out-dir exports `sale` (not a real customer) |
| fixture | I01 golden `sha256:c82f232d…` and integer `termsVersion` reject |

## Account prerequisite

None. Offline Node >= 22. Tests also need `tar` and `unzip`. No Postgres, HTTP, payment, or mailbox.

## Later integration (Root)

- Inject live `@neomorphic/funded-task-terms/hash` (`hashTermsVersion`) when Neo PR54 lands in a consumer; do not copy `services/earned-work`.
- useful-jobs 1.0.0 `feed-agenda` hardcodes `SAMPLE fixture` in ICS even for caller files, so a true local-runtime `sale` label is blocked until that engine changes.
- Bind artifact `sha256:` rows to earned-work `artifact.digestSha256` if a money path needs them. This pack does not pay.
