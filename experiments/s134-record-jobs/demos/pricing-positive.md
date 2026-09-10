# Pricing positive add/change (offline)

Cash **$0**. CLI envelope and report both emit **`paidValueClaim`: false**. This is not a paid catalog, live scrape, currency conversion, or marketplace price proof.

Inputs are already-extracted local JSON under `fixtures/pricing/positive/`. Merchant page-change/record recipes are **not** invoked. Context pin only: `epistemedeus/x402-url-extractor@1a23b648`. S122 merchant `c0255ac` is unresolved here (unknown; not touched).

## Exact commands

Working directory: `/workspace/experiments/s134-record-jobs`.

Field add + value change (`starter` 9→12, `enterprise` added, `pro` unchanged):

```bash
cd /workspace/experiments/s134-record-jobs
node modules/pricing-table-change/cli.mjs --before fixtures/pricing/positive/before.json --after fixtures/pricing/positive/after.json
```

Equivalent npm script (same argv as above):

```bash
cd /workspace/experiments/s134-record-jobs
npm run demo:pricing
```

Unit-only sibling in the same fixture class (C07 owns the unitChanges==1 / fieldChanges==0 assertion):

```bash
cd /workspace/experiments/s134-record-jobs
node modules/pricing-table-change/cli.mjs --before fixtures/pricing/positive/unit-before.json --after fixtures/pricing/positive/unit-after.json
```

## Envelope (always)

Every successful CLI write includes:

```json
{
  "cashBoundaryUsd": 0,
  "paidValueClaim": false
}
```

Do not treat fixture literals (`9`, `12`, `29`, `99`, `USD/mo`) as paid SKU truth.

## This replay (field add/change)

| Check | Observed |
|---|---|
| `paidValueClaim` | `false` |
| `report.ok` | `true` |
| `counts.added` | `1` (`enterprise`) |
| `counts.fieldChanges` | `1` (`starter` 9→12, unit `USD/mo`) |
| `counts.unchanged` | `1` (`pro`) |
| `counts.removed` / `unitChanges` / `conflicting` | `0` |
| `report.uncertainties` | `[]` |

## Free baseline vs difference

- **Free baseline:** eyeball or `diff` two local extracted JSON files.
- **Difference:** structured field/unit deltas (`added` / `fieldChanges` / `unitChanges`) over supplied rows. Does not scrape live pages, convert currencies, or assert SKU truth.
