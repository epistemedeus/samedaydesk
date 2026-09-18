# w1003 receipt-forge fixtures

Local unpaid SDS receipt claims. No live fetch. No payment headers on valid
rows. `charged` and `paymentSent` stay false.

## Valid (must accept)

| File | Meaning |
| --- | --- |
| `valid/unpaid-402-extract.json` | GET `/extract` HTTP 402, amount `5000`, digest matches |
| `valid/unpaid-buyer-stop.json` | Buyer stop before paid retry, `httpStatus` null |
| `valid/unpaid-402-seller-integrity.json` | GET `/commerce/seller-integrity-audit` HTTP 402, amount `10000`, no settlement copy |

## Reject (must fail closed)

| File | Code |
| --- | --- |
| `reject/forged-digest.json` | `receipt_forged` (designated seed) |
| `reject/copied-settlement.json` | `copied_settlement` |
| `reject/fabricated-tx.json` | `fabricated_settlement` |
| `reject/replay-receipt.json` | `receipt_replay` |
| `reject/payment-header-forge.json` | `payment_header_forge` |
| `reject/payto-swap.json` | `pin_mismatch` |
| `reject/settled-offer-receipt.json` | `copied_settlement` |

Regenerate with `node scripts/build-fixtures.mjs` from this pack root.
