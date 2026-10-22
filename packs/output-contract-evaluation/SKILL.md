---
name: output-contract-evaluation
description: Proposed $5 offline evaluation of a promised JSON output contract. Invalid output preserves the banked settlement. Does not pay, publish, or change SKUs.
---

# output-contract-evaluation

Cold-agent skill for the SameDayDesk proposed output-contract evaluation.

Proposed price: `5.000` USDC. Live SKU: no. Payment: none.

## Cold start

From the repository root (no install):

```bash
node tools/output-contract-evaluation/cli.mjs evaluate --pretty --case packs/output-contract-evaluation/fixtures/invalid-output-settlement-preserved.json
```

Pack-local alias:

```bash
node packs/output-contract-evaluation/bin/evaluate.mjs evaluate --pretty --case fixtures/invalid-output-settlement-preserved.json
```

Expected: `decision: "invalid"` and `settlementPreserved: true`. HTTP 200 is not enough.

## Seeded failure

```bash
node tools/output-contract-evaluation/cli.mjs evaluate --pretty --seed void-settlement
```

Expected: exit 1, `void_settlement_on_invalid_refused`. Settlement is not voided.

## Rules

- Evaluate caller-supplied promised paths against the delivered body.
- Preserve settlement bytes on invalid output (amount, transaction, `validDeliveryStatus`).
- Refuse void, refund, rewrite, live SKU, and any price other than 5.000 USDC.
- Do not fetch, charge, sign, or mutate checkout, registry, or payment.
