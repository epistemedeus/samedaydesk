# Paid wrappers of existing useful jobs

Local, **non-settling** paid-offer adapters. SameDayDesk has no x402
ResourceServer; live settlement is out of scope. Fixture payments are labelled
`fixture` / `purchaseAuthority: false` and cannot call live settle.

The default / recommended first offer is **lockfile-pin-delta**: compare two
caller-supplied npm `package-lock.json` files and write `pin-delta.json` plus
`pin-delta.md`. The six published useful-jobs from the `useful-jobs` 1.0.0
archive remain selectable with the same kernel.

Execution contract `samedaydesk.paid-useful-jobs.execution.v1` is documented in
[`CONTRACT.md`](CONTRACT.md). `ok` means transport succeeded and this run's
expected artifacts were delivered. Isolated `runOutDir` is delivery identity;
`--out-dir` is a last-writer published copy, never receipt authority.

Existing live prices (extract `$0.005`, seller-integrity-audit `$0.01`) and
`payTo` are not changed. This tree is not a live paid merchant.

## Literal user journey (copy-paste, offline)

From the repository root, Node >= 22. Supply your own lockfiles (not fixture
paths from this repository):

```bash
node server/paid-useful-jobs/bin/deliver.mjs \
  --job lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE"
```

Accepted lockfile inputs: npm `package-lock.json` with `lockfileVersion` 2 or
3. Equality uses `name`, `version`, `integrity`, and `resolved`. Not
`yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `composer.lock`, `Cargo.lock`,
package.json-only, or HTML.

That path is preflight → managed-order → executor → `verifyComplete(runOutDir)`
→ mailbox pickup/ack. `--second-after` runs a disjoint second job.
`--http` mounts loopback `POST /execute` for the order client.

Also selectable without test injection:

| Job | Required inputs | Outputs |
| --- | --- | --- |
| `lockfile-pin-delta` (default) | `--before` `--after` | `pin-delta.json`, `pin-delta.md` |
| `json-schema-webhook-drift` | `--before` `--after` `--used` | `drift-brief.json`, `drift-brief.md` |
| `route-table-diff` | `--before` `--after` | `route-diff.json`, `route-diff.md` |
| `page-change-offline-job` | `--job-file` (job document) | `page-change.json`, `page-change.md` |
| `vendor-budget-impact` and the other five published useful-jobs | catalog `--before`/`--after`/`--used`/`--input`/`--next-run` | catalog outputs |

`json-schema-webhook-drift` accepts JSON Schema / webhook example JSON plus used
JSON Pointers. It is not OpenAPI. `route-table-diff` accepts SDS route-table /
catalog / raw-array JSON (loopback HTTP locators only). `page-change-offline-job`
accepts an already-held `samedaydesk.extract-batch.v0` job document; it does not
fetch.

Single-job CLI (same kernel):

```bash
node server/paid-useful-jobs/bin/cli.mjs run lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE" \
  --out-dir /tmp/paid-lockfile
```

Usable outputs live under that `--out-dir` as a convenience copy. Receipts bind
`runOutDir`. `sold` is always false.

`--example` / SAMPLE inputs produce labeled sample output and are **not** a paid sale.

`--funding reserved-fixture` requires `--payment` with a recognized fixture object
(same rule in the CLI and `runPaidOffer`). Intent alone is not a reservation.

## Tests

```bash
npm run test:paid-useful-jobs
npm run test:job-input-preflight
npm run test:job-output-atomicity
npm run test:managed-useful-jobs-order
npm run test:result-mailbox
npm run test:d28-journey
npm run test:m01-catalog
```

Seeded fail-closed cases:

1. SAMPLE/`--example` treated as a live sale
2. Missing required input
3. Fixture payload that would settle if the fixture guard were omitted
4. SAMPLE/`--example` / kit SAMPLE path / SAMPLE-labelled copy with reserved-fixture payment (not a sale; `sold` stays false)

## Funding states

`unfunded | reserved-fixture | rejected`. Never `sold`. The envelope's
`settlePayment` always throws `live-settle-out-of-scope`.
