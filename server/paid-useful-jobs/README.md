# Paid wrappers of existing useful jobs (F08)

Local, **non-settling** paid-offer adapters around the six offline useful jobs
from the published `useful-jobs` 1.0.0 archive (PR51). SDS has no x402
ResourceServer; live settlement is out of scope. Fixture payments are labelled
`fixture` / `purchaseAuthority: false` and cannot call live settle.

Engines are reused from `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`.
They are not reimplemented here.

Existing live prices (extract `$0.005`, seller-integrity-audit `$0.01`) and
`payTo` are not changed. Wrapper amounts are **non-live labelled fixtures**
and are not published to the live catalog.

## Literal user journey (copy-paste, offline)

From the repository root, Node >= 22:

```bash
# 1. Use in-repo engines (committed public archive; wrapper extracts + verifies sha256)
# 2. Supply caller files (these fixtures are not SAMPLE kit examples)
# 3. Run the wrapper
# 4. Read usable outputs + receipt

node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --funding reserved-fixture \
  --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json \
  --out-dir /tmp/paid-vendor-budget

# Usable outputs:
#   /tmp/paid-vendor-budget/budget-impact.json
#   /tmp/paid-vendor-budget/budget-impact.md
# Receipt:
#   /tmp/paid-vendor-budget/receipt.json
# fundingState is reserved-fixture; sold is always false.
```

`--example` / SAMPLE inputs produce labeled sample output and are **not** a paid sale.

```bash
node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact --example
# fundingState is not a sale; sample=true
```

## Tests

```bash
npm run test:paid-useful-jobs
```

Seeded fail-closed cases:

1. SAMPLE/`--example` treated as a live sale
2. Missing required input
3. Fixture payload that would settle if the fixture guard were omitted

## Funding states

`unfunded | reserved-fixture | rejected`. Never `sold`. The envelope's
`settlePayment` always throws `live-settle-out-of-scope`.
