# Lockfile pin-delta buyer example

External CLI against a provided merchant base URL. It reads local
`package-lock.json` objects and posts them as HTTP JSON. It does not send
filesystem paths, shell commands, or registry URLs to the merchant.

## Discover (free)

```bash
node examples/lockfile-pin-delta-buyer/cli.mjs \
  --base-url https://agents.samedaydesk.com \
  discover
```

Reads `/openapi.json`, `/.well-known/x402`, `/api/actions`, and one unpaid
`POST /lockfile-pin-delta`. A 402 is the live offer. Missing path means the
host has not set `LOCKFILE_PIN_DELTA_ENABLED=1`. This is not a sale.

## Compare (posts JSON objects)

```bash
node examples/lockfile-pin-delta-buyer/cli.mjs \
  --base-url https://agents.samedaydesk.com \
  compare \
  --before ./before-package-lock.json \
  --after ./after-package-lock.json
```

Without `PAYMENT_SIGNATURE` or `AUTHORIZATION` this prints the unpaid
challenge. Do not paste production credentials into tests.

## Ordinary already-authorized wallet (preferred)

This CLI does **not** sign. It only attaches a caller-supplied
`PAYMENT_SIGNATURE`. Do not invent raw signatures.

Use the existing `examples/customer-x402` client for inspect → `--approve` →
attempt-receipt → read-only reconcile, with the caller's **already configured**
wallet:

```bash
cd examples/customer-x402
npm ci
npm run preflight -- --authorization ./fixtures/authorization-lockfile.json
npm run purchase -- --approve \
  --authorization ./fixtures/authorization-lockfile.json \
  --private-key-env CUSTOMER_X402_PRIVATE_KEY \
  --attempt-receipt ./attempt-receipt.json
```

That path binds exact HTTPS URL, method, `{before, after}` body bytes, network,
asset, recipient, and amount cap before any signer access. Payment is not the
default.

### Free local kit vs paid HTTP

- **Free local kit 1.1.0** (`tools/lockfile-pin-delta`): same pin-delta analysis
  offline. No wallet, no x402.
- **Analysis scope:** name+version+integrity+resolved pins only. Identical pins
  are informational.
- **No vulnerability guarantee:** pin-delta is not a CVE proof and does not join
  advisories.
- **Paid convenience:** live `POST /lockfile-pin-delta` at 5000 atomic USDC,
  x402-only. Charge is the bounded compare, not an install or audit.

Hermes can load AgentSkills; it has **no** native SameDayDesk payer. Do not
copy a wallet into a skill. Signing stays in customer-x402.

## Not in this example

- Production settle or money movement
- Silent wallet creation or keys in prompts
- Caller file paths in the HTTP body
- npm install / audit
- Flipping the engine `sold` flag
- A second payment after an unknown outcome
