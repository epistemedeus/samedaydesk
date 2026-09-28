# Smallest proposed patch (not applied)

File in the released 1.4.0 tree: `apps/vendor-budget-impact/cli.mjs` function `buildImpact`.

Today the wrapper reads `inner.unitChanges` and `inner.fieldChanges` only. `inner.added` / `inner.removed` already exist on the nested report.

Proposed local change, not committed to shared engine files:

1. Count `added` / `removed` in the summary string.
2. For each `inner.added` row, push `kind: "review-added-price-field"` with `fieldKey` and the after value/unit.
3. For each `inner.removed` row, push `kind: "review-removed-price-field"`.
4. For each `inner.fieldChanges` row, include `beforeValue` / `afterValue` / `unit` already present on the nested object.
5. Emit `no-budget-delta` only when added, removed, fieldChanges, and unitChanges are all empty.

That is enough for a caller to see a new SKU. It still would not compute a bill.
