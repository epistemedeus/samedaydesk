# `@samedaydesk/buyer-evidence`

Zero-dependency ESM package. It loads the committed SameDayDesk unpaid `GET /extract` pin and compares a 402 body, discovery row, or replay fixture to that pin.

This repository has no SPDX license file. The package `license` field is `UNLICENSED` to match that. Nothing is published to the npm registry from this tree.

## Install

From a local checkout of this repository:

```sh
npm install /path/to/samedaydesk/packages/buyer-evidence
```

From a packed tarball of this folder (`npm pack`; do not `npm publish`):

```sh
npm pack
npm install ./samedaydesk-buyer-evidence-0.1.0.tgz
```

## What the evidence proves

Given a resource (a 402 `PAYMENT-REQUIRED` body, a discovery row with `accepts`, or a packed replay fixture) and this catalog pin, `verify(resource, evidence)` returns `{ ok, reasons[] }`.

It proves that the resource's stable contract fields match the pin recorded for SameDayDesk `GET https://agents.samedaydesk.com/extract`:

- `scheme` `exact`
- `network` `eip155:8453`
- `payTo` `0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee`
- `asset` Circle USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- atomic amount `5000` (`$0.005` at 6 decimals)
- `extra.name` / `extra.version` `USD Coin` / `2`

Replay fixtures also record how two clients reach that unpaid GET (discover → construct → contract → authorize-ready → stop) without a wallet. Construct fixtures contain no `PAYMENT-SIGNATURE` or `X-PAYMENT` header.

Named failure reasons: `foreign_payTo`, `changed_price`, `stale_timestamp`, `missing_accepts`.

## What the evidence does not prove

- That any client paid, signed, settled, or retried after the 402.
- That a wallet, key, facilitator, or buyer exists or will exist.
- Current `validUntil`, offer-receipt signatures, or other volatile 402 fields (those are omitted from the pin).
- That the Express process in this repository hosts the paid gateway (it does not).
- Completeness of OpenAPI, Bazaar ranking, or any inspected-route feed beyond the fields above.

`now` and `maxAgeSeconds` on `evidence` are caller-supplied. Without them, only an explicit past `validUntil` is treated as stale.

## Usage

### `@x402/extensions` Bazaar filter

Seam: `typescript/packages/extensions/src/bazaar/facilitatorClient.ts` (`filterDiscoveryResources`). Export: `typescript/packages/extensions/src/bazaar/index.ts`.

```js
import { loadCatalog, verify } from "@samedaydesk/buyer-evidence";

const evidence = loadCatalog();
const listed = await client.extensions.bazaar.listResources({ type: "http" });
const kept = listed.items.filter((row) => verify(row, evidence).ok);
```

### `apify/mcpc` fetch middleware

Seam: `src/lib/x402/fetch-middleware.ts` (tool `_meta.x402` reader + 402 retry).

```js
import { loadCatalog, verify } from "@samedaydesk/buyer-evidence";

const evidence = loadCatalog();
const result = verify(paymentRequired, evidence);
if (!result.ok) {
  // do not sign; result.reasons names the mismatch
}
```

### Agent402 payee selection

Seam: `client/index.js` (`withPayeeAllowlist` / `createPaymentPayload`).

```js
import { loadCatalog, verify } from "@samedaydesk/buyer-evidence";

const evidence = loadCatalog();
const result = verify(paymentRequired, evidence);
if (!result.ok) {
  throw new Error(`extract pin refused: ${result.reasons.join(",")}`);
}
```

## Loader

```js
import { loadCatalog, loadRuntime, verify } from "@samedaydesk/buyer-evidence";

const evidence = loadCatalog();
const agent402 = loadRuntime("agent402");
verify(agent402.states.contract, evidence);
```
