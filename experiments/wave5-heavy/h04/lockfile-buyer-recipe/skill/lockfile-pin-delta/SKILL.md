---
name: lockfile-pin-delta
description: Compare two caller-supplied npm package-lock.json objects. Prefer free local kit 1.1.0 offline. Paid POST /lockfile-pin-delta is convenience at the live x402 quote, not a vulnerability guarantee. Sign only with the existing customer-x402 client and an already-authorized wallet. Do not invent signatures or create a wallet.
license: MIT
---

# Compare two supplied lockfiles

Use this when the caller already has two local npm `package-lock.json`
objects (lockfileVersion 2 or 3) and wants added, removed, and changed
name+version+integrity+resolved pins.

This skill does not create a wallet, does not sign, and does not send a
payment header. Hermes has no native SameDayDesk payer. Signing stays in
`examples/customer-x402` with explicit `--approve`.

## Distinguish these products

- **Free local kit 1.1.0** (`tools/lockfile-pin-delta`):
  `node bin/lockfile-delta.mjs --before <lock> --after <lock> --out-dir <dir>`.
  Offline. No wallet.
- **Analysis scope:** pin fields only. Identical pins are informational,
  not failure. Not an install, audit, or registry fetch.
- **No vulnerability guarantee:** a pin-delta is not a CVE proof and does
  not join advisories.
- **Paid convenience:** live
  `POST https://agents.samedaydesk.com/lockfile-pin-delta` (x402-only,
  5000 atomic USDC). Charge is the bounded compare.

Preserve other skills (`web-extract`, `page-change`, `explicit-record`).
Do not route lockfile work through `/extract/batch`.

## Unpaid inspect (never touches a wallet)

From a merchant checkout after `cd examples/customer-x402 && npm ci`:

```bash
npm run preflight -- --authorization ./fixtures/authorization-lockfile.json
```

Inspect the live 402. Confirm exact HTTPS URL, POST, body bytes, network
`eip155:8453`, Base USDC asset, recipient, and 5000 atomic cap. Stop if
any term drifts. A 402 is not permission to pay.

## Ordinary already-authorized signing

Only if the caller already has a configured wallet and explicit
expenditure authority for those exact terms:

```bash
npm run purchase -- --approve \
  --authorization ./fixtures/authorization-lockfile.json \
  --private-key-env CUSTOMER_X402_PRIVATE_KEY \
  --attempt-receipt ./attempt-receipt.json
```

Do not put key material in this skill, in prompts, or in fixtures.
The environment variable name is a pointer; the value is never printed.

## After a paid attempt

- HTTP 200 with `analysis=actionable|informational|partial` and
  `charged=true` is a compare result, not a CVE.
- Timeout / unknown / crash: keep the attempt receipt. Read-only
  reconcile. Do not mint a new payment.
- Same payment credential with a different body is a replay negative
  (HTTP 409, not a second charge). Do not retry as a new purchase.

## Pitfalls

- `examples/lockfile-pin-delta-buyer` only forwards a precomputed
  payment credential. Do not invent one.
- Do not send filesystem paths, URLs, or commands in the HTTP body.
- Do not transplant HTTP payment credentials into `mcp://`.
- Default customer-x402 commands still target `/extract/batch`. Lockfile
  requires an authorization file bound to `/lockfile-pin-delta`.
