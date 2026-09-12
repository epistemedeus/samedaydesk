# Control: examples/customer-x402 @ 7aaf004

Merged merchant 1.23.48. This is the ordinary-wallet recipe, not a new stack.

## Install

```bash
git clone https://github.com/epistemedeus/x402-url-extractor.git
cd x402-url-extractor
git checkout 7aaf00410900dc41fb523d1b7b4469b40ded7981
cd examples/customer-x402
npm ci
```

## Fundless inspect

```bash
npm run preflight -- --authorization ./fixtures/authorization-lockfile.json
```

Never touches a wallet. Expect HTTP 402, `outcome=preflight_ok`, amount `5000`.

## Wallet path (existing configured key; throwaway in tests)

```bash
npm run purchase -- --approve \
  --authorization ./fixtures/authorization-lockfile.json \
  --private-key-env CUSTOMER_X402_PRIVATE_KEY \
  --attempt-receipt ./attempt-receipt.json
```

`--approve` is required. Exact URL/method/`{before,after}` bytes/network/asset/recipient/amount cap bind before signing.

## Uncertain settlement

```bash
npm run reconcile -- --reconcile \
  --attempt-receipt ./attempt-receipt.json \
  --rpc-url https://YOUR_EXPLICIT_RPC
```

Do not mint a new payment after `unknown`.
