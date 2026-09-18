# Feature map — SDS receipt-forge (w1003)

Write boundary: `packs/verifiers/w1003-receipt-forge/**` only.

| ID | Intent | This pack | Status |
| --- | --- | --- | --- |
| w1003-receipt-forge | Reject forged unpaid SDS receipts | `src/lib.mjs`, `bin/receipt-forge.mjs` | Implemented |
| cold-run | Accept committed unpaid 402 + buyer-stop fixtures | `--cold` / `--suite` | Implemented |
| seeded-failure | Naive-accept / honest-reject `forged-digest` | `fixtures/reject/forged-digest.json` | Implemented |
| copied-settlement | Refuse in-tree facilitator tx on the wrong resource | `fixtures/reject/copied-settlement.json` | Implemented |
| fabricated-tx | Refuse made-up settlement hashes | `fixtures/reject/fabricated-tx.json` | Implemented |
| replay | Refuse spent receiptId | `fixtures/reject/replay-receipt.json` | Implemented |
| payment-header | Refuse PAYMENT-SIGNATURE on unpaid 402 | `fixtures/reject/payment-header-forge.json` | Implemented |
| pin-swap | Refuse payTo not matching SDS pin | `fixtures/reject/payto-swap.json` | Implemented |
| settled-offer | Refuse `offerReceipt.receipt` on unpaid claims | `fixtures/reject/settled-offer-receipt.json` | Implemented |

## Explicitly not this pack

- Paying, checkout, Stripe, x402 spend, or facilitator settle
- Publishing a catalog or touching neomorphic-io
- Fetching live HTTP (`--live` is refused)
- Rewriting SDS prices, SKUs, or `payTo`
- Treating HTTP 402 as delivery or a matching digest as chain settlement
