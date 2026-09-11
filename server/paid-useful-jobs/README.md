# Paid wrappers of existing useful jobs (F08)

Local, **non-settling** paid-offer adapters around the six offline useful jobs
from the published `useful-jobs` 1.0.0 archive (PR51). SDS has no x402
ResourceServer; live settlement is out of scope. Fixture payments are labelled
`fixture` / `purchaseAuthority: false` and cannot call live settle.

Engines are reused from `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`.
They are not reimplemented here.

Execution contract `samedaydesk.paid-useful-jobs.execution.v1` is documented in
[`CONTRACT.md`](CONTRACT.md). `ok` means transport succeeded and this run's
expected artifacts were delivered. Analysis refusal / no-change with a complete
artifact set can still be useful. Kit acquisition, engine crash, and missing
output stay distinct from that.

Existing live prices (extract `$0.005`, seller-integrity-audit `$0.01`) and
`payTo` are not changed. Wrapper amounts are **non-live labelled fixtures**
and are not published to the live catalog.

## Literal user journey (copy-paste, offline)

From the repository root, Node >= 22:

```bash
node server/paid-useful-jobs/bin/deliver.mjs \
  --job vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json
```

That path is preflight → managed-order → executor → `verifyComplete(runOutDir)`
→ mailbox pickup/ack. Isolated `runOutDir` is delivery identity; `--out-dir`
is a last-writer published copy. `--second-after` runs a disjoint second job.
`--http` mounts loopback `POST /execute` for the order client.

Single-job CLI (same kernel):

```bash
node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --out-dir /tmp/paid-vendor-budget
```

Usable outputs live under that `--out-dir` as a convenience copy. Receipts bind
`runOutDir`. `sold` is always false.

`--example` / SAMPLE inputs produce labeled sample output and are **not** a paid sale.

`--funding reserved-fixture` requires `--payment` with a recognized fixture object
(same rule in the CLI and `runPaidOffer`). Intent alone is not a reservation.

```bash
node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact --example
# fundingState is not a sale; sample=true
```

## Tests

```bash
npm run test:paid-useful-jobs
npm run test:job-input-preflight
npm run test:job-output-atomicity
npm run test:managed-useful-jobs-order
npm run test:result-mailbox
npm run test:d28-journey
```

Seeded fail-closed cases:

1. SAMPLE/`--example` treated as a live sale
2. Missing required input
3. Fixture payload that would settle if the fixture guard were omitted
4. SAMPLE/`--example` / kit SAMPLE path / SAMPLE-labelled copy with reserved-fixture payment (not a sale; `sold` stays false)

## Funding states

`unfunded | reserved-fixture | rejected`. Never `sold`. The envelope's
`settlePayment` always throws `live-settle-out-of-scope`.
