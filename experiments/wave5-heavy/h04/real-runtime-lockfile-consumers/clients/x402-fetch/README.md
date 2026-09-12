# Official @x402/fetch 2.25.0

Coinbase/x402-foundation HTTP client. Not the SameDayDesk customer-x402 wrapper.

## Install

```bash
mkdir scratch && cd scratch
npm init -y
npm install @x402/fetch@2.25.0 @x402/evm@2.25.0 @x402/extensions@2.25.0 viem
```

## Fundless inspect

Call **plain** `fetch` (not `wrapFetchWithPayment`). The wrapper signs and sends on the first 402.

## Wallet path

`wrapFetchWithPayment(fetch, client)` + `ExactEvmScheme(signer)` reuses exact POST body bytes via `Request.clone()`.

Lockfile seller requires `payment-identifier`. Register the official `@x402/extensions/payment-identifier` enricher (same helper customer-x402 uses). Without it, paid POST is `400 payment_identifier_required`.

There is no `--approve`, no attempt-receipt, no reconcile CLI. `processPaymentResult.recovered` can create a **second** payment payload.

## Limits

- Default spend control is `$1` per payment, not an exact 5000-atomic lockfile cap.
- Do not point this wrapper at production with a funded wallet from this recipe.
