# AE18 Hostinger integration result

Implemented `/api/machine-gateway` and `/api/monitor` in the existing Node app, real Postgres execution/monitor stores, finite scheduler ticks, tenant/grant/budget enforcement, durable receipts, delivery polling/ack and restart recovery. Existing health, webhooks, MCP, contributor prefixes and SPA routing are preserved; no human pages changed.

- Branch: `codex/ae18-host-integration-243001`.
- Exact implemented/tested source HEAD: `d1b63983f0320d6b6213501cab72cc487c8464b2`. The subsequent report commit adds evidence only.
- Pins: gateway `7e5078bbf213ae3d1ff8d4638199ff8d1d1d81a8`; monitor/foundation `0ad6691f79225cfba782971a910c0e79d371c8f3`; Pilot inputs `ae1d2d22322a95bce0195d28cfb4811dc448b23d`.
- Adapter installed/tested locally: Postgres on a disposable PostgreSQL 16 verify-full TLS fixture, Node 22.14.0. Native SQLite remains local/test only; production rejects it.
- Actual tests: **15/15 Postgres integration**, **76/76 native SQLite**, **49/49 existing runtime regressions**; final monitor changes also reran **22/22** SQLite tests. Clean production `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` passed. All heavy commands used the shared flock. [TAP/validation](test/evidence/validation.json).
- Lost HTTP acknowledgement and lost admission-commit response do not duplicate execution/effect; changed local HTTP source → durable event → consumer poll/ack → cold Node restart/readback passed. TLS hostname mismatch, cross-pool claims, leases, pause/cancel/revocation, finite budgets, foreign keys/cursors and full environment preservation passed.
- [Source/migration/env-key install+rollback package](deploy/README.md), [exact artifact hashes](deploy/DEPLOYMENT.json). Source overlay: `/tmp/sds-ae18-d1b63983-source.tgz` (SHA-256 `788aee9e88c025e86a012c7c68743e53f609789e0e24207850118bd266413ee8`).

Remaining action: **Root binds the existing database/credentials, runs the explicit migration and free-grant installer, applies the full preserved environment with feature flags, and deploys through the existing Hostinger workflow.** Startup stays `node server/index.js`; no new service or spend. Root must receive the actual HTTPS hostname and verify public ingress, authorized free work, restart/readback and old routes. No deployment, public launch, live payment or subscriber charge was performed here; local fixtures establish no public availability.
