# Recipe — existing-wallet purchase of lockfile pin-delta

Merchant pin `ca38205279f0d543515b81b7261909e55ea2600f`. Apply `patch/`
first so `examples/customer-x402` accepts `POST /lockfile-pin-delta`.
Until then, unpatched `normalizeAuthorization` refuses
`authorization path must be /extract/batch`.

## 0. Free local kit (no wallet)

Kit **1.1.0** (`tools/lockfile-pin-delta` / merchant
`vendor/lockfile-pin-delta`):

```bash
node bin/lockfile-delta.mjs \
  --before ./before-package-lock.json \
  --after ./after-package-lock.json \
  --out-dir ./out
```

Same analysis scope as the paid route: added / removed / changed
name+version+integrity+resolved pins. Identical pins are informational.
This is **not** a vulnerability scanner and **not** a CVE proof.

## 1. Bind exact terms (no keys)

Copy `authorization/authorization-lockfile.json` and replace `body.before`
/ `body.after` with the caller’s lockfile **objects** (not paths). Keep:

| Field | Live value |
| --- | --- |
| `method` | `POST` |
| `url` | `https://agents.samedaydesk.com/lockfile-pin-delta` |
| `network` | `eip155:8453` |
| `asset` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base USDC) |
| `recipient` | `0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee` |
| `amountCapAtomic` | `5000` |
| `assetName` / `assetVersion` | `USD Coin` / `2` |
| `maxTimeoutSeconds` | `300` or less |

The client serializes compact `{"before":...,"after":...}` once at
approval and binds those **exact bytes**. Pretty-printed `bodyRaw` that
does not match that serialization is refused.

Inspect live OpenAPI / unpaid 402 before paying. Drift → stop.

## 2. Free exact quote / inspect (never touches a wallet)

```bash
cd examples/customer-x402
npm ci
npm run preflight -- --authorization ./fixtures/authorization-lockfile.json
```

Expect `outcome=preflight_ok`, HTTP 402, `walletAccessed=false`.
A 402 is the offer, not a sale. Default commands still do not pay.

## 3. Ordinary already-authorized signing

Only with the caller’s **existing** configured wallet and expenditure
authority for those exact terms. Inject the key via an environment
variable name; never paste it into a prompt.

```bash
npm run purchase -- --approve \
  --authorization ./fixtures/authorization-lockfile.json \
  --private-key-env CUSTOMER_X402_PRIVATE_KEY \
  --attempt-receipt ./attempt-receipt.json
```

`--approve` is required. The official `@x402/fetch` wrapper consumes the
already-inspected challenge and performs **at most one** signed send.
There is no second discovery request.

Useful change → `valid_delivered`, `analysis=actionable`, `charged=true`.
No-change → `valid_delivered`, `analysis=informational`, `charged=true`.

## 4. Exact replay / reconcile

- **Same body + same payment credential:** HTTP 200,
  `x-payment-replay: hit`. Not a second settle.
- **Different body + same credential:** HTTP 409, `charged=false`.
  Replay-negative. Not a new charge. Do not “fix” it by paying again.
- **Timeout / unknown / crash:** `outcome=unknown`. Keep the attempt
  receipt. Read-only reconcile. **Do not mint a new payment.**

```bash
npm run reconcile -- --reconcile \
  --attempt-receipt ./attempt-receipt.json \
  --rpc-url https://YOUR_EXPLICIT_RPC
```

Reconcile refuses `--approve` and wallet flags.

## 5. What not to do

- Do not use `examples/lockfile-pin-delta-buyer` as the signer. It only
  forwards `PAYMENT_SIGNATURE`.
- Do not create a wallet because the recipe mentioned payment.
- Do not transplant HTTP credentials into `mcp://`.
- Do not treat pin-delta as a CVE or advisory join.
- Do not retry a **new** payment after unknown outcome.
