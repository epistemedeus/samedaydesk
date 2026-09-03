# Unpaid buyer-runtime fixtures

This directory is the SameDayDesk unpaid replay for `GET /extract`. It is not a wallet, not a payment client, and not a registry package.

A stranger can load the committed fixtures from a clone of this repository. Nothing here sends `PAYMENT-SIGNATURE` or `X-PAYMENT`.

## Requirements

- Node.js 22 or newer
- A checkout that contains this folder and `fixtures/buyer-runtimes/`
- ESM. Default `npm init` writes `"type": "commonjs"`. Put the examples in a `.mjs` file, or set `"type": "module"` in the nearest `package.json`. A `.js` file in a CommonJS project will fail with `Cannot use import statement outside a module`.

## Install

There is no `npm install @samedaydesk/...` on the public registry for this loader.

```sh
git clone https://github.com/epistemedeus/samedaydesk.git
cd samedaydesk
```

Do **not** run `npm pack` at the repository root. That packs the private `samedaydesk` app, not this loader.

If this checkout also contains `packages/buyer-evidence/package.json`, that folder is the packable ESM module. Pack **only** that folder:

```sh
cd packages/buyer-evidence
npm pack
```

Then, in a **separate** empty project (not this clone):

```sh
npm init -y
npm install /path/to/samedaydesk-buyer-evidence-0.1.0.tgz
```

Save the usage example as `usage.mjs` (see below).

## Quickstart (fixture path, no wallet)

From the repository root of this clone:

```sh
node --input-type=module -e '
import { loadCatalog, loadRuntime } from "./tools/buyer-runtimes/lib.mjs";

const catalog = loadCatalog();
const agent402 = loadRuntime("agent402");
const coinbase = loadRuntime("coinbase-x402");
console.log(catalog.route.path, Object.keys(agent402.states), Object.keys(coinbase.states));
'
```

Expected stdout includes `/extract` and the five state names `discover`, `construct`, `contract`, `authorize-ready`, `stop` for each runtime.

If the import of `./tools/buyer-runtimes/lib.mjs` fails with `Cannot find package '@samedaydesk/buyer-evidence'`, this checkout re-exports a local package. From the repository root run `npm install` once (the dependency is `file:packages/buyer-evidence`), then retry the snippet. Still do not send a payment header.

### Packed module (only when `packages/buyer-evidence` exists)

Save as `usage.mjs`:

```js
import { loadCatalog, loadRuntime, verify } from "@samedaydesk/buyer-evidence";

const evidence = loadCatalog();
const agent402 = loadRuntime("agent402");
const result = verify(agent402.states.contract, evidence);
console.log(result);
```

```sh
node usage.mjs
```

Expected stdout: `{ ok: true, reasons: [] }`.

The Bazaar / fetch-middleware / Agent402 snippets in that package README are attach points for those codebases. They are not a standalone quickstart: they assume a `client` or a `paymentRequired` body you already have. Do not copy live `payTo`, network, asset, or amount from docs into runtime source. Read current terms from https://agents.samedaydesk.com/.well-known/x402.

## Checks in this repository

From the repository root, fixture-only (skips live unpaid probes):

```sh
SKIP_LIVE_BUYER_REPLAY=1 npm run test:buyer-runtimes
```

`npm run test:buyer-runtimes` without that env var also performs unpaid `GET` probes (HTTP 402). It does not sign, does not retry with a payment header, and does not transfer funds.

## What this does not do

- It does not create a wallet or sign a payload.
- It does not call a facilitator verify or settle.
- It does not host the paid gateway (that origin is `https://agents.samedaydesk.com`).
