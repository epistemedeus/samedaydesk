# Opportunity intake 221400 — deployable runbook

This path is a sibling of the earned-work kernel. It reserves an atomic budget and records an owed IOU. It does not transfer USDC, fetch artifact URLs, or turn a fixture into production participation. Root hosts. A green fixture run is not hosted claim automation.

## Cause

A closed campaign was treated as a closed relationship. Closed campaigns and already earned obligations stay as recorded. A full, closed, or mismatched request returns a next task or a waitlist. A waitlist has `paidSlot: false` and `doNotStartWork: true` until a claim returns claim authority.

## Preconditions

- Node 22
- Disposable Postgres, not a payment database
- `EARNED_WORK_DATABASE_URL=postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test`
- `EARNED_WORK_OWNER_TOKEN` of at least 8 characters. The fixture default is `dev-owner-token-s275`
- Do not set `productionAdmission` true in this worker path

Start Postgres with `services/earned-work/scripts/pg-fixture.sh` when it is not already accepting connections on port 55432.

## Replay

From `services/earned-work`:

```bash
npm ci
npx tsc -p ../../experiments/arena/workability-dimensions/tsconfig.f01.json
npm run build
npm test
node --import tsx scripts/opportunity-receive.mjs
```

`npm test` runs the kernel suite plus `tests/opportunity-intake.test.ts`, `tests/opportunity-receive.test.ts`, and `tests/opportunity-openapi.test.ts` against real Postgres. The receive script creates its own schema, imports ten synthetic fixture reservations, assigns three synthetic workflow scopes, shows a full discovery route and a refused public workflow grab, submits and accepts one discovery record, replays the same settlement key after a store restart, and closes notice `CRT-100198` without changing its `0.10` / `0.50` promise. It then drops the schema.

The script exits 2 when the round file has `provenance: production` or `productionAdmission: true`.

## Operator CLI

Against an already running earned-work process:

```bash
export EARNED_WORK_BASE_URL=http://127.0.0.1:8791
export EARNED_WORK_OWNER_TOKEN=dev-owner-token-s275
node scripts/opportunity.mjs create-round \
  --file fixtures/opportunity/agent-opportunity-221400-v1.round.json \
  --idempotency-key round-221400
node scripts/opportunity.mjs read-round \
  --round agent-opportunity-221400-v1 \
  --provenance fixture
```

Import, assign, claim, submit, accept, start, waitlist, and notice are the other commands. stdout is `{ "status", "body" }`. Repeat the same `Idempotency-Key` to reconcile an unknown outcome. A second import with the same import key does not mint another credential.

## What stays unpaid

Acceptance writes `opportunity_obligations` with `adapter=null_nonpaying_v0`, `paid=false`, `settled=false`, `transfer=null`, and `revenue=false`. It does not insert `earned_work_obligations`. Settlement remains an owner action outside this service. If a contributor cannot receive Base USDC, the owed record stays; the asset is not rewritten.

## Closed campaign pointer

`src/lib/opportunity-continuation.mjs` is attached by `src/pages/api/trials/contributor-reuse-trial.json.ts` only when public submissions are closed. The pointer does not reserve a reward. Human homepage copy is unchanged. The kernel OpenAPI file `openapi.json` does not list these routes. `openapi-opportunity.json` is the separate contract.

## Original failures corrected here

- A changed cap was rejected as a new catalog before the service noticed the round terms were already fixed. The fixed round now returns `409 round_unchanged`.
- The restart test dropped the connection on the first commit, which was round creation, so the import itself was never the unknown outcome. The loss now targets the import commit. Retry returns the stored row.
- The race asked for a pool of 8. The service allows 1–4. Two independent client processes share a pool of 4.
- Holder readback stripped `assignedScope`, so the assigned witness could not see the private scope. Public round reads still omit it.
- Duplicate-import coverage reused one idempotency key across different bodies. Each duplicate now has its own key and the same import identity.

## Root still does

Host the service through the exact integration below, reconcile the already Sent-verified offers from the private Root ledger, and admit production explicitly only after the delivery and authorization gates. Reviewer fixtures are not that ledger. Ten discovery and three workflow offers are already sent; do not recreate or resend them from this fixture. Review and any later settlement remain Root actions. No payout occurred here.

## Receiving amendment 221500: exact existing-host integration

The actual candidate is still an unconfigured standalone Node service. SameDayDesk's existing managed correspondence/foundry runtime has retained PostgreSQL (operator-provided state), but that does not mount this app. The repository's `services/correspondence/deploy/S51-SHARED-HOST.md` documents the existing correspondence mount at `/api/correspondence` and schema `pilot_correspondence`. The opportunity app must get a separate namespace and owner authority. The current Neomorphic static publication does not provide a resident service. No host, grant or production admission was created by the receiving worker.

The smallest integration is one additional Express app mount inside the existing resident Node process, using the existing retained PostgreSQL installation. Prerequisites: Root must verify Node 22 and an Express-compatible mount in that process; retained database capacity plus up to four connections; a dedicated application role allowed to create/own its schema and run DDL; host-controlled secret injection; an HTTPS route to this mount; and the existing supervisor's shutdown hook. A DML-only database role cannot boot this service because boot runs migrations. If that managed runtime cannot mount a Node/Express app, this option is unavailable: Root must arrange a supported resident process using already budgeted infrastructure before advertising delivery. Retained PostgreSQL alone is insufficient. No new purchase is authorized by this plan.

1. Root reviews the receiving branch, then owns default merge and the deployment checkout. Ship `services/earned-work`, its migrations/contracts, and the local dependencies `experiments/arena/workability-dimensions` and `packs/funded-task-terms` together; a lone copied `dist/index.js` is insufficient. Run `npm ci && npm run build` in `services/earned-work` on the host's pinned checkout.
2. In the existing retained PostgreSQL installation, Root provisions a dedicated app/schema owner for `neo_opportunity_221400`. Inject its URL as `NEOMORPHIC_OPPORTUNITY_DATABASE_URL` and the independent owner bearer as `NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN` through the existing private secret manager. These names below are integration inputs, not existing automatic wiring. Do not use the correspondence admin token or a generic foundry database URL. Do not put values in Git, browser metadata or this receipt.
3. Register the following at the existing process's server bootstrap before its 404 handler, using that checkout's actual absolute module path. This code is a reviewable integration recipe, not an applied deployment:

   ```js
   import { createApp, createPostgresStore, loadConfig } from "<approved-checkout>/services/earned-work/dist/index.js";
   const cfg = loadConfig({
     ...process.env,
     DATABASE_URL: undefined,
     EARNED_WORK_DATABASE_URL: process.env.NEOMORPHIC_OPPORTUNITY_DATABASE_URL,
     EARNED_WORK_OWNER_TOKEN: process.env.NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN,
     EARNED_WORK_PG_SCHEMA: "neo_opportunity_221400",
     EARNED_WORK_POOL_MAX: "4",
     EARNED_WORK_VERIFIER: "default",
     EARNED_WORK_CORS_ORIGINS: "https://neomorphic.io",
     EARNED_WORK_TRUST_PROXY: "0",
   });
   const store = await createPostgresStore(cfg.databaseUrl, {
     schema: cfg.pgSchema, poolMax: cfg.poolMax,
   });
   hostApp.use("/api/neomorphic-opportunity", createApp(store, cfg));
   // Existing supervisor: drain host HTTP, then await store.close().
   ```

   Boot applies `001_init.sql`, `002_opportunity_rounds.sql`, then additive `003_opportunity_personal_capacity.sql`. It does not rewrite existing round terms or obligations. Set the trust-proxy hop count to the actual bounded proxy topology if required; the example trusts no forwarded IP. Route only this prefix through the host's existing HTTPS gateway to the process. Do not proxy the whole standalone kernel indiscriminately. Restrict owner mutation routes to the host's owner control plane; bearer checks still apply. Preserve request method/body, Authorization and Idempotency-Key. Do not grant owner access through a claimant field, public id or browser-supplied provenance.
4. Verify the mounted prefix on disposable storage first. The receiving test `existing-process mount serves the exact prefixed route and preserves owner boundaries` demonstrates `/api/neomorphic-opportunity/healthz`, round reads, authenticated claims, preservation of the existing app route, exact prefixed request observation, and claimant refusal on owner close. This proof uses loopback and disposable PostgreSQL. Root must separately prove the real HTTPS origin, restart persistence, database outage/health, owner-only grant/admission, holder readback and acceptance before production. A health response alone does not prove this admission journey.
5. Keep production credentials and live ledger rows outside reviewer fixtures. Root's controlled admission should use the same `agent-opportunity-221400-v1` round key with explicit `production` provenance and admission, cap `300000`, prices `10000`/`50000`, slot counts `10`/`4`, and ownerReservedSlots `10`/`3`. Preserve the private Sent offer scopes and deadlines; the fixture's synthetic scopes/date are not authority to replace an actual promise. Create via an owner request at the mounted `/v1/opportunity-rounds`; reconcile original import keys and assignments from Root's ledger; read back counts `250000` committed and `50000` unassigned once all thirteen reservations are recorded. Before import, `250000` is protected; outsiders cannot take those personal slots. The remaining workflow slot requires an owner-confirmed scope. A full/closed applicant receives a nonpaying waitlist or unfunded alternative. Do not call the receive fixture script against retained production data.
6. Contributor onboarding currently requires a Root-issued scoped bearer, via owner import or owner `POST /v1/contributor-tokens`. There is no anonymous credential registration/self-service identity verification path. Root may deliver a holder grant through the existing private correspondence workflow after authenticating that recipient. Public labels do not establish identity. Once the HTTPS delivery and grant journey are proven, Root can review a narrow agent metadata change to configure absolute claim/read and waitlist URLs in `src/lib/opportunity-continuation.mjs`, and adapt the host's public projection to advertise only proven, admitted inventory. Until then the paths are null, `deliveryState=unconfigured`, `publicClaimable=false`, `publicRemainingSlots=0`, `hostedClaimAutomation=false`. Configuration counts and budget are not public admission.

## Event-driven source notice reconciliation

The operator reports that the stale old caller OpenTask task was closed once at `04:59:36 UTC`; its original terms stay intact. Do not call close again or reopen it. Root should use the retained runtime's existing authenticated task-lifecycle dispatch/outbox, with its existing source-task mapping, to reconcile notices when a source closes, expires, fills, or changes admission. No new poller or scheduled discovery loop is needed.

For that already recorded closure, replay the existing trusted closure event into the notice projection once, keyed by its original event id. Its handler copies `campaignKey` and `preservedPromise` from the owner-maintained immutable source record and posts to the mounted `POST /v1/opportunity-notices` with the original event-derived Idempotency-Key and private owner authority. The body may name `nextRoundKey=agent-opportunity-221400-v1`; that is a relationship pointer with no reservation or delivery path. Never derive the preserved promise, closed state, verified source evidence or owner authority from a claimant report. Concurrent identical notices serialize and leave one notice; conflicting promises return `409 promise_immutable`. A source notice update does not recreate the old offer or pay a debt.

The source task/event id, source mapping, actual managed dispatch hook and secret references remain private Root prerequisites. No API name for that external lifecycle hook is asserted by this repository, and no live hook was installed here. This service's notice projection is idempotent, but it does not itself subscribe to OpenTask or reconcile external sources. Root binds that existing event dispatch and verifies the resulting notice before publication. For later opportunity round closure, the same trusted dispatch can call `/v1/opportunity-rounds/{roundKey}/close` with explicit provenance; submitted/owed rows remain retained and unpaid.

## Compatibility and expiry

The additive migration leaves old price/terms/obligation documents intact. Newly created terms hash the complete summary and personal allocation. Existing fixed rounds are not silently rewritten. The receive script uses synthetic fixture data and now removes its schema and scratch files on both success and failure.

Idempotency receipts are snapshots of committed responses. Reconcile an unknown write using the same principal, path, key and body, then use authenticated current readback for authority/expiry. A fresh key cannot change an imported identity or scope, or resurrect its expired reservation. Submitted and owed claims survive expiry/closure. An owed row remains on `null_nonpaying_v0` with `paid=false`, `settled=false`, `transfer=null`, `revenue=false`.

Submit/source request hashes now bind the addressed claim. Outstanding receipts from the pre-amendment runtime may conflict under the tightened hash when first replayed after a code upgrade; Root must reconcile any such pending writes on the original version/readback before switching versions. No production participant or pending production write was imported here. Old rows with no import intent hash retain their original scope/identity and are not rewritten by migration.
