# w823 receipt-forge pack receipt

Pack: `packs/verifiers/w823-receipt-forge/`
Product: `samedaydesk-receipt-forge-w823`
Boundary: this directory only. No neo, pay, publish, checkout, or live fetch.

## What a cold pass proves

1. Committed SDS `/extract` accept is still `5000` atomic Base USDC to the SDS pin.
2. Committed extract observation is still HTTP 402 with that accept and no payment header.
3. Committed agent402 settlement tx is still bound to `/commerce/seller-integrity-audit`.
4. Committed buyer-runtime stop still refuses facilitator settle.
5. Valid unpaid claim fixtures recompute to their claimed SHA-256.
6. Seeded forges in `fixtures/reject/` are rejected with the declared codes.

## What it does not prove

- On-chain finality of `0x2916cfe2…`
- That any extract call was paid
- Live x402 catalog freshness
- HMAC rotation (separate commerce-receipt pack)

## Seeded failure

`forged-digest`: well-formed SDS origin + `sha256:` string, amount mutated
`5000` → `1` after the digest was bound. Naive accept, honest `receipt_forged`.
A restamped extract amount `1`, known tx on the bound unpaid identity,
`X-PAYMENT-RESPONSE`, and `request.url` ≠ `resource` are also rejected.
