# S51 RESULT — shared-host correspondence bridge

Date: 2026-09-09/10 UTC. Host: this VM. Model: Grok 4.6 xhigh.

## Inputs

- Neo S44 orphan tree `90ed833ee9b6104fb41692a59a02d324395f6899` (not merged to Pilot main)
- SDS main `1b01c26a0995af9fced515b2f551d2dbd949bcb2`
- S48/S49 not modified (no market-observations module)

## Outputs (feature branches only)

| Repo | Branch | SHA |
| --- | --- | --- |
| epistemedeus/samedaydesk | `codex/s51-shared-host-correspondence-20260909` | `218b2fa74d63951eeeda4cf0a67c420835a58b01` |
| epistemedeus/pilot (orphan Neo overlay, not main) | `codex/s51-shared-host-correspondence-20260909` | `2326f5589cb78f599ea62aab05486c9a7dacd002` |

Patches: `patches/sds-s51-shared-host.patch`, `patches/neo-s44-s51-correspondence.patch`.

## What shipped

Thin Express sub-app mount at `/api/correspondence` on the existing SDS Node process (Hostinger Node22/Express5). Accepted service reused (`createApp` + postgres store), not rewritten. Standalone `/healthz` and `/v1` unchanged. Prefix is the SDS mount plus CLI/client/OpenAPI/saved-state address `…/api/correspondence`. CORS remains exact Neomorphic origins (no host-global wildcard). Schema `pilot_correspondence`, pool max 4, `CORRESPONDENCE_DATABASE_URL` only. Unconfigured/invalid/store-down: SDS `/api/health`, MCP, static, headers unchanged; correspondence healthz is truthful `enabled: false`. One reconnect after 5s cooldown, no retry loop, no memory production store.

## Changed paths (SDS)

`server/index.js` (`createSdsApp` + mount before 1mb JSON), `server/lib/correspondence-mount.js`, tests under `server/scripts/test-correspondence-*.js`, `package.json`/`package-lock.json` (`pg`, `zod`, `file:./vendor/neomorphic-correspondence`), `.env.example`, `docs/CORRESPONDENCE-SHARED-HOST.md`, vendored `dist/` + `migrations/001_init.sql`.

## Changed paths (Neo overlay)

`src/config.ts`, `src/store/postgres.ts`, `src/migrate.ts`, `src/index.ts`, `src/app.ts` (additive `enabled: true` on healthz), `bin/safe-io.mjs`, `openapi.json`, `package.json` exports, README, tests (`prefix-*`, `schema-isolation`, ServiceConfig fields), `tests/correspondence-client.test.mjs`, `tests/correspondence-session.test.mjs`.

## Tests (Node v22.23.2, disposable PG 17.11 toolchain, temp tokens)

- correspondence `npm test` with `CORRESPONDENCE_TEST_DATABASE_URL`: **50 pass / 0 fail / 0 skip**
- SDS mount disabled/malformed/accept/negative: **5 pass**
- SDS `test-spa-fallback`: **2 pass**; `test-mcp-protocol-negotiation`: **9 pass**; `public-entry`: **4 pass**
- `tsc -p tsconfig.json` on overlay: pass
- Sentinel `s51_sentinel.keep_me` and `public.unrelated_app` untouched by namespaced migrate+re-run (schema-isolation + accept tests)

No public traffic, signup, payment, mail, prod migrate/deploy.

## Process cleanup

Owned disposable `pg_ctl` clusters stopped after tests. No leftover `postgres` servers. No Chrome used. Native Grok children (no further fanout):

- C1 `d10dd1a0-6257-457f-93cf-a9cb7df3e6b4` mount
- C2 `27343893-1104-4fb3-b956-66a4de7bbc10` prefix (finished `df36cb4`; prefix tests composed)
- C3 `a1a6834e-7976-4932-a9c3-d8da8dca5d7f` pg
- C4 `5a406bc6-bc8c-4298-9d51-12be85ae4b0c` accept

Mechanism: grok CLI `--no-subagents` (S50 pattern). Parent composed the tested trees.

## Quota / capacity (dated)

- Heavy `/usage` 2026-09-09T23:44:55Z: weekly used **33%**, remaining **67%**, reset **2026-09-10T18:27:00Z**. No reset/overage. `usage-admission.json`.
- Admit 2026-09-09T23:49:56Z: MemTotal 16.79 GiB, avail 8.29 GiB, 5 grok CLIs. Finish sample 2026-09-10T00:03:39Z: avail 8.38 GiB, free-after-25% 4.47 GiB.

## Root activation (no new subscription)

See `clones/samedaydesk/docs/CORRESPONDENCE-SHARED-HOST.md`. Unset by default. Root sets `CORRESPONDENCE_DATABASE_URL` + admin token + schema `pilot_correspondence` on existing Hostinger Node, runs `node vendor/neomorphic-correspondence/dist/migrate.js`, restarts SDS. CLI `--base-url` must include `/api/correspondence`. Rollback: unset env, restart; optional `DROP SCHEMA pilot_correspondence CASCADE` only after root confirms.

## Still unhosted

Production SDS env not changed. No live migrate, no DNS, no new plan. Closed-pilot remains off until root activates from existing hosting/DB state.
