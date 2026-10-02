# Root integration and operation

This adapter executes the existing four snapshot recipes through the installed
Node runtime and VF02 authority/store. It uses `pilot_correspondence` and the
existing correspondence idempotency table for immutable job/result receipts.
It creates no table/database, signer, payment route or reward/acceptance record.

1. Receive this isolated branch and run the commands below on Node 22.x. Keep the
   sealed useful-jobs 1.0.0–1.4.7 archives and VF1652533 import closure unchanged.
2. Review `SOURCE-CONTRACTS.md` and apply `patches/ROOT-MOUNT.patch` to the current
   SameDayDesk receiving head. It changes only `server/app.js`/`server/index.js`:
   mount before global JSON intake, register the handle for existing shutdown.
   Tests apply this exact patch in a disposable source tree and start the actual
   SDS index, MCP initialize, readiness and uploads routes.
3. Confirm the existing recorded Postgres enrollment. The staged production
   condition remains absent/unverified here. `SUPABASE_SERVICE_ROLE_KEY` and a
   Supabase HTTP URL cannot supply `CORRESPONDENCE_DATABASE_URL`. Do not obtain
   another provider/key, replace storage or reuse the product Supabase service.
   If enrollment is absent, leave admission disabled; anonymous supplied-snapshot
   evaluation can still run. Only Root activates the existing enrollment through
   `server/foundry/install.mjs --migrate --install` and its current host/private
   profiles, following `server/foundry/activation/ACTIVATION.md`. No startup
   migration or automatic project creation is implemented here.
4. After the existing installer has enrolled the selected store, add
   `HOSTED_USEFUL_JOURNEY_OPT_IN=1` to the serving process alongside its already
   authorized `FOUNDRY_HOST_OPT_IN=1`, `CORRESPONDENCE_DATABASE_URL`,
   `CORRESPONDENCE_ADMIN_TOKEN`, `CORRESPONDENCE_PG_SCHEMA=pilot_correspondence`,
   `CORRESPONDENCE_STORE=postgres` and existing foundry host profile/key settings.
   Budget at most two additional backend connections for this adapter: the
   installed WorkCellStore uses the installed-client transaction seam and does
   not borrow its separate pool for journey commands. Audit the host's existing
   connection budget before enrollment; no new storage is substituted.
5. Restart the existing `node server/index.js` under Node 22.x with the existing
   manager. Configure its proxy for <=64KiB bodies and >=30s bounded requests.
   The client propagates one absolute deadline covering its raw input and all
   transport; the adapter bounds raw intake, owned child group and remaining PG
   statements/commit. The canonical boundary's bounded rollback/connection cleanup
   may finish after a caller loses its reply; that is unknown delivery, not a
   success. Same-key replay and current retrieval reconcile it.
6. Independently read `/api/hosted-useful/recipes` and `/healthz` on the production
   origin. `enabled` means the existing store is reachable; it does not change
   `publicationVerified` or `productionReady`. Acquire and verify the candidate
   client bytes separately before updating any publication receipt.
7. Obtain an already authorized project writer/owner grant through the existing
   authority, never a new global unauthenticated write. Supply a caller JSON
   snapshot task. Use `COLD-CLIENT.md` to evaluate, run, recover and retrieve.
   Do not use example input as an outside-customer receipt. Root alone handles
   an actual participant/task and later observation or paid request.

## Source receiving commands

```bash
node --version
npm ci --ignore-scripts --no-audit --no-fund
# Actual merchant source must occupy the existing declared local input layout.
# QA used an immutable Git archive of merchant91fbf947 in /tmp/merchant-input/x402-url-extractor.
node --test tools/recurring-job-recipes/test/*.test.mjs tools/result-reuse/test/*.test.mjs
node --test --test-concurrency=1 tools/hosted-useful-journey-100346/test/*.test.mjs
npm run test:agent-readiness
npm run test:foundry-host
npm run test:foundry-activation
npm run test:l08-agent-repair
npm run test:hosted-startup
npm run build
node tools/hosted-useful-journey-100346/scripts/measure-qa.mjs
git apply --check tools/hosted-useful-journey-100346/patches/ROOT-MOUNT.patch
node tools/hosted-useful-journey-100346/scripts/export.mjs
```

PostgreSQL 16 test binaries are required by the existing disposable store helper;
all migrated projects/grants/cells/receipts are in that disposable store. Tests
use real adjacent merchant services and canonical PG/work-cell logic. No public
writes, paid calls, live participant records or real reward ledger mutations.

Known receiving baseline: `test:agent-readiness` is 126/127 on this branch.
`server/scripts/agent-readiness/http-mcp.test.js:35` expects literal MCP tool
names in existing `client/public/llms.txt`; the same assertion fails at unchanged
base `1f333f3` (that file's suite is 3/4 there). Human copy and the shared owning
test remain unchanged. Root must reconcile that discovery contract separately;
do not report a fully green readiness suite or silently update human copy.

## Route and lifecycle contract

`/api/hosted-useful/recipes`, `/healthz` and `POST /evaluate` are public inspection
and evaluation. Evaluation never admits a job. Authenticated routes are under
`/projects/:projectId/jobs`: admission POST with `Idempotency-Key`, opaque job
GET with `?taskId`, `/run` POST with taskId, `/result` GET with taskId,
`/cancel` POST with taskId/current expectedRevision/reason/(writer fence), and
`/export` POST with explicit purpose/digest/opt-in. `schema` is
`samedaydesk.useful-recipe-request.v1`; supported recipe ids and limits are in
`lib/contracts.mjs`. Server paths, live URLs, shell/code, provider credentials
and copied trusted/accepted flags are refused. Snapshot bytes are caller-owned
data, not independently fetched evidence.

Admission binds exact key/body/current grant/project. Run claims the actual VF02
lease. The same operation has one retained result; a changed input needs a new
operation. Result insertion, checkpoint and release commit atomically in the
same installed transaction. A valid recipe negative has `state: completed` and
`recipe.ok: false`; executor failure is `state: failed`. Neither proves
acceptance or usefulness. Crash-before-result leaves a live/expired lease;
takeover uses a new fence only while the original deadline remains. An expired
job requires review and a new operation. Crash-after-commit/reply-loss recovers
the immutable result without rerunning. Cancellation records actual VF02 state,
aborts a child on the serving process, and fences all processes' late results.
A worker on another process remains bounded by the original execution deadline;
its cancelled/expired/revoked fence cannot persist output.

Existing current owner/creator writer controls run/cancel/export; project readers
can retrieve retained results. Every transaction rechecks current grant expiry
after row waits. Revocation blocks old credentials. Resolved projects keep read
and exact recovery while rejecting new work. Retained prior references check
tenant/task/recipe/digest. Optional observation export uses the existing scrubber
and 32KiB projection; selected useful record fields survive, with public trust
still unverified. Completed results are immutable and cancellation does not
rewrite them; current authority and correction/revocation remain owning facts.

## Rollback and publication

Unset `HOSTED_USEFUL_JOURNEY_OPT_IN`, restart SDS, and retain the existing schema,
grants, cells and receipts. Public evaluation stays available, admission returns
503. Revert the shared mount integration in both files if the whole adapter must be
removed; do not drop data or modify human pages/prices. Existing foundry rollback
is separate and remains Root's operation.

`successors/0.1.0` is a licensed minimal client candidate, not deployed bytes.
Root can place the exact received archive at a new machine download path and
link it from a new agent entry without replacing the offline catalog or its
publication flags. The isolated `entry.json` states that both archive hosting
and production routes are unverified. Promote only the fact actually read back:
source acceptance, exact hosted archive, operational route, outside useful use,
and settled payment each need their own receipt. No human copy/index changes
are applied by this branch.
