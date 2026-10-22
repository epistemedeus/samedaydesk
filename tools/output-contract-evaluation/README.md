# Output-contract evaluation (proposed $5)

Offline evaluator for a promised JSON output contract against a delivered
body. HTTP 200 is not valid delivery by itself. When the output is invalid,
the banked settlement is copied through unchanged: no void, refund, amount
rewrite, or `validDeliveryStatus` rewrite.

This is a **proposed** 5.000 USDC evaluation. It is not a live SKU. The CLI
does not pay, publish, or mutate checkout, registry, or prices.

Write boundary: `tools/output-contract-evaluation/**`, `packs/output-contract-evaluation/**`.

## Advertised entry (cold run)

From the repository root, no install:

```bash
node tools/output-contract-evaluation/cli.mjs evaluate --pretty --case packs/output-contract-evaluation/fixtures/invalid-output-settlement-preserved.json
```

Expected: `ok: true`, `decision: "invalid"`, `settlementPreserved: true`,
`settlementMutated: false`, `paid: false`, `proposal.priceUsdc: "5.000"`,
`proposal.live: false`. The settlement `amountUsdc`, `transaction`, and
`validDeliveryStatus` match the input case.

## Seeded failure

Void-on-invalid is refused. Settlement is not rewritten to empty:

```bash
node tools/output-contract-evaluation/cli.mjs evaluate --pretty --seed void-settlement
```

Expected: exit 1, `ok: false`, `error.code: "void_settlement_on_invalid_refused"`,
`settlement: null`.

Proof that the reject is the named code:

```bash
node tools/output-contract-evaluation/cli.mjs evaluate --seed void-settlement --expect-reject void_settlement_on_invalid_refused --pretty
```

Expected: exit 0, `ok: true`, `codes` includes `void_settlement_on_invalid_refused`.

## Other commands

```bash
node tools/output-contract-evaluation/cli.mjs --help
node tools/output-contract-evaluation/cli.mjs --suite
node --test tools/output-contract-evaluation/test.mjs
node packs/output-contract-evaluation/bin/evaluate.mjs evaluate --pretty --case fixtures/invalid-output-settlement-preserved.json
```

Pack fixtures also cover a valid match, HTTP 200 with missing paths, live-SKU
refuse, missing settlement, price rewrite away from 5.000 USDC, and
refund-on-invalid.

## Limits

- Caller supplies the promised paths, the delivered body, and the settlement.
- The evaluator does not fetch, sign, or talk to a facilitator.
- Invalid output is an evaluation decision, not a payment reversal.
- Seller-integrity-audit ($0.01) and settlement-proof ($0.005) stay separate
  live routes. This pack does not change them.
