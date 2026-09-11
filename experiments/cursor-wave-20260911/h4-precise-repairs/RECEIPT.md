# H4 precise repairs — receipt

- **SDS start HEAD:** `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 merge)
- **Branch:** `fable/h4-precise-repairs`
- **Heavy session id:** `1434eeed-5e5c-48d1-b2d1-1ea29c966400`
- **Merchant pin:** `a143898dd1ec35c097ca7eb0b472f30dad1ee319` (`fixtures/merchant-pr54/indexing-payload-continuity.mjs`)
- **Runtime:** Node v22.22.2; tests via `node --experimental-strip-types --test tests/*.test.ts`
- **Secrets:** none

## Commands

| Command | Result |
| --- | --- |
| Inspect SDS catalog, `verified.json`, `server/pricing.js`, ResourceServer hooks | Current source recorded (see contradictions) |
| `npm test` (this pack) | **pass** — 30/30 |

## Contradictions vs brief (followed current source)

- SDS at PR51 has **no** ResourceServer `onBeforeVerify` / `onBeforeSettle` and **no** `verifyPayment` / `settlePayment` assignments. Those names exist on the copied x402-url-extractor PR54 fixture, not on SDS server. Encoded as diagnostics only; no live hook install.
- Brief “no live $15 job”: SDS hosted `seller_contract_repair` is **$490.00** (`server/pricing.js`). No $15 offer exists. Pack is G01 proposal-only at any price.
- Live unpaid-402 pins match the brief’s do-not-change list: `GET /extract` **$0.005** (atomic `5000`), `GET /commerce/seller-integrity-audit` **$0.01** (atomic `10000`), asset Base USDC, network `eip155:8453` (`client/public/x402/verified.json`).
- Six useful jobs are free offline (`purchaseAuthority: false` in catalog). Used as repair subjects, not F08 paid wrappers.
- `client/src/data/machineEntry.mjs` still pins an older extractor commit (`ef46e2b…`). This pack uses the specified PR54 pin only for indexing-payload continuity diagnostics.

## Scope held

Own directory only. No homepage styles, live price edits, payment-route reassignment, merchant PRs, deploy, or Wave 1/2 features.
