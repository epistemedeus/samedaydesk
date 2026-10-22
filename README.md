# SameDayDesk

Public site and agent-commerce case study for SameDayDesk. Paid HTTP routes are served by the live machine gateway at `https://agents.samedaydesk.com`, not by the Express process in this repository.

## Buyer runtime (unpaid fixtures)

To obtain and exercise the unpaid `GET /extract` replay **without a wallet**, follow [tools/buyer-runtimes/README.md](tools/buyer-runtimes/README.md).

That guide is the integrator path:

1. Clone this repository (there is no registry package for the in-tree loader).
2. Run the ESM fixture snippet from the repository root, in a `.mjs` file or with `node --input-type=module`.
3. Optionally run `SKIP_LIVE_BUYER_REPLAY=1 npm run test:buyer-runtimes`.

Do **not** run `npm pack` at the repository root. This `package.json` is `private` and a root pack is the whole app, not the buyer-runtime loader.

If `packages/buyer-evidence/` is present in your checkout, `cd` into that folder and run `npm pack` there, then `npm install` the resulting `samedaydesk-buyer-evidence-*.tgz` in a separate project. Details are in the guide above.

Do not send `PAYMENT-SIGNATURE` or `X-PAYMENT` while following that guide. Do not copy payment terms from documentation; read them from https://agents.samedaydesk.com/.well-known/x402.

## Site

The human site lives under `client/`. See [client/README.md](client/README.md) for the Vite app.
