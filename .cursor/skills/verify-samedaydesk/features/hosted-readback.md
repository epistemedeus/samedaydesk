# hosted-readback

The Hostinger Node app is `node server/index.js` (`npm start`). Health is `/api/health` `{service:"samedaydesk"}`. Production SPA shells need `client/dist`.

| field | value |
| --- | --- |
| goal | real listen + health + shells |
| entrypoint | `server/index.js`; `test:hosted-startup`; `test:spa-route-shells` |
| command | `build` then `serve` then `fetch /api/health` |
| state | listening on `PORT`; secrets stripped from the verify spawn env |
| tests | `npm run test:hosted-startup`, `test:spa-route-shells` |
| prerequisite | `npm ci`; `client/dist` for prod static |

## Sub-features

- `health` GET `/api/health` 200 `{ok:true,service:"samedaydesk"}`.
- `start-path` `npm start` equals `node server/index.js`.
- `shells` `/for-agents/useful-jobs` and `/x402*` exist in `SPA_ROUTE_SHELLS`.
- `once` start → health → stop without leaking a pid.

## How to get to it (user POV)

- Hostinger Node app per `web-guides/DEPLOY-HOSTINGER.md`.
- Local: `npm start` after `npm run build`.

## Driving it with verify-cli

Preconditions: Node 22, root deps.

- **Build.** `node tools/verify/cli.mjs build --json`. Must run `npm run build` (includes `test:hosted-startup` + client `tsc -b && vite build`). Prove `client/dist/index.html`.
- **Serve.** `node tools/verify/cli.mjs serve once --json` or `serve start`. Ready = health JSON.
- **Routes.** `node tools/verify/cli.mjs routes --json`.
- **Fetch.** `node tools/verify/cli.mjs fetch --path /api/health --json` (needs origin/pid).

## Gotchas

- `dev:server` uses `--env-file=.env`. Verify start does **not** load `.env` and deletes Stripe/Resend keys from the child env.
- Browser-smoke is loopback Chrome, not production fetch.
- Live apex 403 HTML is `cdn_challenge`.
- `serve once` tears the listener down before returning. `prove --feature hosted-readback` keeps `server/index.js` up for the health fetch, then stops it.
- `serve start` reuses a pid file only when `/api/health` still answers `{service:"samedaydesk"}`. A dead or reused pid is not killed.
