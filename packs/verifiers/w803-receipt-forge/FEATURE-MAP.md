# w803 receipt-forge feature map

Write boundary: `packs/verifiers/w803-receipt-forge/**` only.

| SDS surface | Pack action | Not claimed |
| --- | --- | --- |
| `fixtures/presence/catalog/x402.json` GET `/extract` | Cold-pin amount `5000`, scheme `exact`, network `eip155:8453`, SDS `payTo`/`asset` | Live catalog fetch |
| `fixtures/verified-feed/observations/extract-current.json` | Cold-pin HTTP 402 unpaid extract accept | Delivery, paid body |
| `tools/evidence-records/fixtures/settlements/agent402-external-validation-purchase-2026-08-29.json` | Pin tx `0x2916cfe2…` to `/commerce/seller-integrity-audit` | Re-settlement, chain finality |
| `fixtures/buyer-runtimes/coinbase-x402/states/stop.json` | Pin buyer stop (no wallet, no PAYMENT-SIGNATURE) | Paid retry |
| Unpaid receipt claim | Canonical SHA-256 over body; mismatch is `receipt_forged` | Settlement proof |
| Copied known tx onto `/extract` | `copied_settlement` | That extract was paid |
| Invented tx | `fabricated_settlement` | |
| Spent `receiptId` replay | `receipt_replay` | |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` / `X-PAYMENT-RESPONSE` / `PAYMENT-RESPONSE` on unpaid | `payment_header_forge` | |
| Known tx on its bound unpaid-labeled claim | `paid_as_unpaid` | Chain finality |
| `payTo` not the SDS pin | `pin_mismatch` | |
| `--live` `--pay` `--checkout` `--publish` `--neo` `--settle` | CLI exit 2 `REFUSED` | |

HTTP 402 is not delivery. `paymentSent` stays false.
