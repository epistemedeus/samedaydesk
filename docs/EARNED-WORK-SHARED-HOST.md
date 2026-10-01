# Earned-work on the existing SDS process

The host is the SameDayDesk Node process (`server/index.js` calls `createSdsApp()`). The Astro site is not this host. This branch vendors the packed adapter. It does not provision a database, bind a public address, fund a task, or pay.

Source acceptance on a disposable Postgres is not public reachability. `GET /api/health` does not say the earned-work mount is deployed. Readiness is only `GET /api/earned-work/healthz`.

## Stored deployment input

Inspected files: `.env.example`, `server/foundry/activation/enrolled-public.json`, `server/foundry/activation/DELTA.md`, `docs/FOUNDRY-HOST-RECEIVER.md`, `docs/CORRESPONDENCE-SHARED-HOST.md`. No panel environment was read. No secret value was copied.

| Stored fact | State |
| --- | --- |
| Product data service | Supabase HTTP host `arvmcttdegqwiwdaembr.supabase.co`, `configured: true`, `secretCopied: false` |
| Hostinger | Public platform header recorded as `hostinger`. `panelEnvRead: false`. Entry remains `server/index.js` |
| Correspondence Postgres | `correspondenceDataService.enrolled: false` |
| `DATABASE_URL` | Not in `.env.example` and not in the enrolled snapshot |
| `EARNED_WORK_DATABASE_URL` | Absent |

Missing capability: a dedicated Postgres connection named `EARNED_WORK_DATABASE_URL`, separate from the product Supabase project. Root supplies that URL from an existing store. This tree does not.

## Env-name checklist

Product and Hostinger names already documented for the SDS process. Do not repurpose them as the earned-work database:

`NODE_ENV`, `PUBLIC_URL`, `PORT` (Hostinger injects this; do not set it), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEOMORPHIC_SELLER_CONFORMANCE_STRIPE_PAYMENT_LINK_ID`, `FIXPACK_STRIPE_PAYMENT_LINK_IDS`, `FIXPACK_STRIPE_PRODUCT_IDS`, `VITE_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `RESEND_WEBHOOK_SECRET`, `ADMIN_EMAIL`, `ADMIN_UID`, `PULSE_TOKEN`, `PULSE_FILE`, `VITE_POSTHOG_KEY`, `VITE_SITE_URL`.

Correspondence and visitor-foundry names stay on their own mount. They are not enrolled as a database connection:

`CORRESPONDENCE_DATABASE_URL`, `CORRESPONDENCE_ADMIN_TOKEN`, `CORRESPONDENCE_PG_SCHEMA`, `CORRESPONDENCE_POOL_MAX`, `CORRESPONDENCE_CORS_ORIGINS`, `CORRESPONDENCE_TRUST_PROXY`, `CORRESPONDENCE_STORE`, `CORRESPONDENCE_BODY_LIMIT_BYTES`, `FOUNDRY_HOST_OPT_IN`, `FOUNDRY_HOST_PROFILE_FILE`, `FOUNDRY_PARTICIPATION_KEY_FILE`, `FOUNDRY_PRIVATE_PROFILE_FILE`, `FOUNDRY_PRODUCTION_ACTIVATE`.

Earned-work names Root sets on the existing Hostinger app when activating. Values are not committed:

| Name | Bound |
| --- | --- |
| `EARNED_WORK_MOUNT` | `1` enables. `0` disables without dropping schema |
| `EARNED_WORK_DATABASE_URL` | Dedicated Postgres URL. This is the missing capability |
| `EARNED_WORK_OWNER_TOKEN` | Owner bearer, at least 8 characters. Not a contributor grant |
| `EARNED_WORK_PG_SCHEMA` | `pilot_earned_work` |
| `EARNED_WORK_POOL_MAX` | Integer 1–4. Use 2 unless the connection budget says otherwise |
| `EARNED_WORK_TRUST_PROXY` | Hop count 0–5. Default 0 |
| `EARNED_WORK_VERIFIER` | `default` until a reproduction executable is intentionally configured |
| `EARNED_WORK_CORS_ORIGINS` | Exact origins. Default `https://neomorphic.io` |
| `EARNED_WORK_RATE_LIMIT_MAX` | Optional request cap |
| `EARNED_WORK_RATE_LIMIT_WINDOW_MS` | Optional window |

`DATABASE_URL` does not enable the mount and is not a migration fallback for `node server/earned-work/migrate.mjs`. A URL that names the product Supabase project is refused before a connection.

## Activation

```
export EARNED_WORK_DATABASE_URL='postgres://…'
export EARNED_WORK_PG_SCHEMA=pilot_earned_work
export EARNED_WORK_POOL_MAX=2
node server/earned-work/migrate.mjs
```

Set `EARNED_WORK_MOUNT=1` and `EARNED_WORK_OWNER_TOKEN` on the existing process, then restart `node server/index.js`.

Ready: `GET /api/earned-work/healthz` returns 200 `{ "ok": true, "enabled": true, "store": "postgres" }`.

Off, including when the names above are unset: 200 `{ "ok": false, "enabled": false, "reason": "unconfigured" }` or `"invalid_config"` or `"disabled"`. Earned-work `/v1` routes return 503. The body does not say "not deployed".

`GET /api/health`, checkout, MCP, and `/api/correspondence/healthz` stay on their own routes.

## Ordinary contributor

No database URL and no owner token:

```
node server/earned-work/ordinary-contributor.mjs \
  --base-url https://host.example/api/earned-work \
  --token-file grant.txt \
  --task TASK_ID \
  --evidence-file evidence.json
```

The process exits 1 before importing the client when `DATABASE_URL`, `EARNED_WORK_DATABASE_URL`, `EARNED_WORK_OWNER_TOKEN`, `EARNED_WORK_PAYOUT_KEY`, or `EARNED_WORK_PG_SCHEMA` is set.

One objective example over the existing `samedaydesk.w821-402-matrix.unpaid.v1` contract:

```
EARNED_WORK_OWNER_TOKEN=… node server/earned-work/objective-task.mjs \
  --base-url https://host.example/api/earned-work
```

The owner token stays in the operator process. The child contributor receives a task grant file only. The seeded `forged-settle` fixture is a useful negative: a naive unpaid label would accept it, and the contract checker rejects it. That rejection is the verifier. Reward `0.10` USDC in the task record is a hypothesis. Default delivery does not move cash. Root binds any funded experiment separately, after balance and payout evidence.

## Rollback

1. Set `EARNED_WORK_MOUNT=0` on the existing Hostinger app and restart `node server/index.js`.
2. Leave schema `pilot_earned_work` in place. Do not `DROP SCHEMA`.
3. `GET /api/health` stays 200. Earned-work health reports `enabled: false`.
4. Set `EARNED_WORK_MOUNT=1` and restart to read the same rows.

`node server/earned-work/migrate.mjs` again is `CREATE SCHEMA` / `CREATE TABLE IF NOT EXISTS`. It does not delete obligations or evidence.

`DROP SCHEMA pilot_earned_work CASCADE` is disposable-fixture cleanup after a receipt, not production rollback.
