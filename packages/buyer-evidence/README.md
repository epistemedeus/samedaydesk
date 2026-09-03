# `@samedaydesk/buyer-evidence`

Zero-dependency ESM package. It loads the committed SameDayDesk unpaid `GET /extract` pin and compares a 402 body, discovery row, or replay fixture to that pin.

This repository has no SPDX license file. The package `license` field is `UNLICENSED` to match that. Nothing is published to the npm registry from this tree.

## Install

This module is not on the npm registry. Pack **this folder only**:

```sh
cd packages/buyer-evidence
npm pack
```

In a separate empty project:

```sh
npm init -y
npm install /absolute/path/to/samedaydesk-buyer-evidence-0.1.0.tgz
```

Examples are ESM. Save them as `usage.mjs`, or set `"type": "module"` in that project's `package.json`. Do not run `npm pack` at the repository root.

## What the evidence proves

Given a resource (a 402 `PAYMENT-REQUIRED` body, a discovery row with `accepts`, or a packed replay fixture) and this catalog pin, `verify(resource, evidence)` returns `{ ok, reasons[] }`.

It proves that the resource's stable contract fields match the catalog pin recorded for SameDayDesk `GET https://agents.samedaydesk.com/extract`. Read the pin from `fixtures/catalog.json`. Current accept terms live on the origin manifest at https://agents.samedaydesk.com/.well-known/x402. This README does not copy scheme, network, payTo, asset, amount, or extra.

`verify()` only returns the four named reasons: `foreign_payTo`, `changed_price`, `stale_timestamp`, `missing_accepts`.

Replay fixtures also record how two clients reach that unpaid GET (discover → construct → contract → authorize-ready → stop) without a wallet. Construct fixtures contain no `PAYMENT-SIGNATURE` or `X-PAYMENT` header.

## What the evidence does not prove

- That any client paid, signed, settled, or retried after the 402.
- That a wallet, key, facilitator, or buyer exists or will exist.
- Current `validUntil`, offer-receipt signatures, or other volatile 402 fields (those are omitted from the pin).
- That the Express process in this repository hosts the paid gateway (it does not).
- Completeness of OpenAPI, Bazaar ranking, or any inspected-route feed beyond the fields above.

`now` and `maxAgeSeconds` on `evidence` are caller-supplied. Without them, only an explicit past `validUntil` is treated as stale.

## Attach points (not a standalone program)

These snippets are attach points, not a standalone program. `client` and `paymentRequired` come from the Bazaar, mcpc, and Agent402 codebases named in each block.

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

## Loader (fixture path, no wallet)

```js
import { loadCatalog, loadRuntime, verify } from "@samedaydesk/buyer-evidence";

const evidence = loadCatalog();
const agent402 = loadRuntime("agent402");
const result = verify(agent402.states.contract, evidence);
console.log(result); // { ok: true, reasons: [] }
```

```sh
node usage.mjs
```
