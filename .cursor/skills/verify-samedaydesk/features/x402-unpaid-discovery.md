# x402-unpaid-discovery

Read-only discovery of the machine-commerce gateway. Unpaid `/extract` is HTTP 402. No signature, no retry-with-pay.

| field | value |
| --- | --- |
| goal | 402 / OpenAPI / manifest without pay |
| entrypoint | `GATEWAY_ORIGIN` in `client/src/data/machineEntry.mjs`; pages `/x402`, `/x402/verified`, `/x402/seller-conformance` |
| command | `fetch --target gateway-unpaid`; `openapi check` |
| state | unpaid 402; fixture OpenAPI 1.23.40 may drift from live |
| tests | `npm run test:presence`, `test:buyer-runtimes` |
| prerequisite | outbound HTTPS to `agents.samedaydesk.com` for live; fixtures otherwise |

## Sub-features

- `healthz` GET 200.
- `openapi` GET JSON; report version drift vs `fixtures/presence/catalog/openapi.json`.
- `x402-manifest` GET `/.well-known/x402`.
- `extract-unpaid` GET `/extract?url=https://example.com` → **402**.

## How to get to it (user POV)

- Human pages `/x402`, `/x402/seller-conformance`, `/x402/verified`.
- Machine: `https://agents.samedaydesk.com/openapi.json` and `/.well-known/x402`.

## Driving it with verify-cli

Preconditions: never send `PAYMENT-SIGNATURE` or `X-PAYMENT`.

- **Unpaid suite.** `node tools/verify/cli.mjs fetch --target gateway-unpaid --json`. Exit 0 only if `/extract` is 402 and docs are not `cdn_challenge`.
- **OpenAPI.** `node tools/verify/cli.mjs openapi check --json` (add `--live` to quote drift).
- **Apex page.** After `serve`+build, `fetch --path /x402` on loopback. Live apex TLS is a separate `--target apex` probe.

## Gotchas

- Fixture OpenAPI **1.23.40** vs live **1.23.49** is drift to report, not a secret second merchant.
- `client/public/x402/verified.json` is build-time inspection (`badge: unverified` when Bazaar stale).
- Do not treat `/extract` 402 as a sale.
