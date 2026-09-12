# Lockfile buyer recipe — ordinary wallet path for `POST /lockfile-pin-delta`

Merchant pin: `ca38205279f0d543515b81b7261909e55ea2600f` (1.23.47).
Live: `POST https://agents.samedaydesk.com/lockfile-pin-delta` x402-only @ 5000 atomic USDC.

## What was true before this packet

`examples/customer-x402` already inspects a 402, binds exact HTTPS
URL/method/body bytes, requires `--approve`, signs once with an injected
wallet, writes an optional attempt receipt, and reconciles read-only.

Unpatched `normalizeAuthorization` still **refuses** any POST whose path
is not `/extract/batch`. That is the remaining integration gate. The
generic purchase/preflight/reconcile stack does not need a second payer.

`examples/lockfile-pin-delta-buyer` only forwards a precomputed
`PAYMENT_SIGNATURE`. Ordinary agents should not invent raw signatures.

## Preferred artifact

**Both:** a tested recipe on the existing customer-x402 client, plus a
tiny merchant patch that adds `/lockfile-pin-delta` to POST
authorization routing and discoverability copy.

## Limits

- No silent wallet creation. The signer is the caller’s existing wallet.
- No keys in prompts, fixtures, or this recipe.
- No payment by default. Unpaid preflight never touches a wallet.
- No new payment after an unknown outcome. Reconcile; do not respend.
- No live payment in this package. Proofs use a mounted merchant, a fake
  facilitator, and a throwaway test signer.
- Hermes loads AgentSkills and has **no** native merchant payer. Do not
  invent one.
- Free local kit **1.1.0** remains the offline compare. Paid HTTP is
  convenience. Analysis is pin fields only. **No vulnerability guarantee.**

## Run proofs

```bash
cd experiments/wave5-heavy/h04/lockfile-buyer-recipe
MERCHANT_ROOT=/tmp/w5-h04/merchant-ca38205 npm test
```

Requires the merchant pin checkout with `npm ci` (including
`examples/customer-x402`). Tests spawn `server.js` locally.

See `RECIPE.md` for the operator steps and `patch/` for Root transfer.
