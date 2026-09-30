# Production activation delta

`productionActivate` is **HOLD**. This file is the difference between the enrolled Hostinger app and the foundry activation package. Nothing here sets environment variables, restarts the hosted process, or copies a secret.

The machine-readable snapshot is `enrolled-public.json`. `node server/foundry/activation/delta.mjs` prints the delta from that snapshot. `node server/foundry/activation/delta.mjs --live` measures the public origin again and exits 1 when the snapshot has drifted. Both leave `productionReady` false.

## What is live

Public HTTP on 2026-09-30, without a Hostinger API read and without panel environment values:

| Surface | Observation |
| --- | --- |
| `GET /api/health` | 200, `service` `samedaydesk`, product data services `supabase`, `stripe`, and `email` configured |
| `GET /api/correspondence/healthz` | `enabled: false`, `reason: unconfigured` |
| `GET /api/correspondence/foundry-receiver` | 503 `unconfigured` |
| `GET /api/correspondence/v1/visitor-entry` | 503 `unconfigured` |
| `POST /api/uploads/signed-url` | 501 |
| `POST /mcp` `initialize` `2025-11-25` | `samedaydesk-agent-tools` `1.2.0`. No tool was called |
| Platform response header | `hostinger` |
| GitHub `main` | `a51110ab6ede18658cac816042edc491b34e0a5e` |

`unconfigured` is the process response when `CORRESPONDENCE_DATABASE_URL` and `CORRESPONDENCE_ADMIN_TOKEN` are both unset and `FOUNDRY_HOST_OPT_IN` is not `1`. Those names are inferred absent. Their values were not read.

The public client names the product data service host `arvmcttdegqwiwdaembr.supabase.co`. No key from that bundle is stored in this tree.

The cited Hostinger build, from the SDS261 acceptance record and not reread by this job, is `01a0f451-7f50-7318-8ce6-d3835d24b89f`, completed `2026-09-30T21:56:55Z`, Node 22, Express, entry `server/index.js`, commit `a51110ab6ede18658cac816042edc491b34e0a5e`. That commit matches current `main`. This activation package is not in that deploy.

## What Root still changes

1. Keep the product Supabase project as the SDS data service. Do not put `arvmcttdegqwiwdaembr` in `CORRESPONDENCE_DATABASE_URL`, and do not copy its keys.
2. Authorize a separate Postgres URL. That URL is not enrolled here. The schema is `pilot_correspondence`.
3. Put mode `0600` profile and key files outside the repo. The private profile is installer-only.
4. Run `node server/foundry/install.mjs --migrate` and then `--migrate --install` against that URL.
5. Set these names on the existing Hostinger app, then restart `node server/index.js`: `FOUNDRY_HOST_OPT_IN`, `CORRESPONDENCE_DATABASE_URL`, `CORRESPONDENCE_ADMIN_TOKEN`, `CORRESPONDENCE_PG_SCHEMA`, `CORRESPONDENCE_POOL_MAX`, `CORRESPONDENCE_STORE`, `CORRESPONDENCE_TRUST_PROXY`, `CORRESPONDENCE_CORS_ORIGINS`, `CORRESPONDENCE_BODY_LIMIT_BYTES`, `FOUNDRY_HOST_PROFILE_FILE`, `FOUNDRY_PARTICIPATION_KEY_FILE`.
6. Leave `FOUNDRY_PRODUCTION_ACTIVATE` unset or `HOLD`. Leave `SUPABASE_*`, `STRIPE_*`, `RESEND_*`, and `PULSE_TOKEN` as they are.

A health body, an MCP initialize, or a configured Supabase flag is not a foundry task result and is not production activation.

## Client compatibility while that is pending

`node server/foundry/activation/client-compat.mjs --origin https://samedaydesk.com` exits 0 while the origin is still this disabled mount and the existing MCP client still gets `samedaydesk-agent-tools` `1.2.0`. Exit 1 means the public state diverged. Exit 2 means a success claim was rejected. The command does not report `productionReady`.

The official visitor client is `vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/visitor.mjs` (`register`, `contribute`, `use`). The portable kit is Wasmtime `49.0.0`, profile `vf08.wasmtime49-linux-x64-fixed.v1`. `node server/foundry/activation/cold-job.mjs` runs those against `node server/index.js` and a private PostgreSQL cluster: one cold visitor, a held-out portable result, a second visitor after HTTP restart, then a boot with foundry variables unset. The product Supabase project is not that database. The schema is not dropped.

`node server/foundry/activation/client-compat.mjs --fixture server/foundry/activation/fixtures/seeded-client-false-green.json` exits 2. Health plus MCP initialize is not portable-kit interoperability.

## Rollback

`node server/foundry/activation/rollback.mjs` prints the procedure and changes nothing. `--apply` exits 2. Root rollback unsets the foundry and correspondence names, restarts `node server/index.js`, keeps `pilot_correspondence`, and leaves the product data service settings in place.
