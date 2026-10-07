# Root activation, migration, rollback, receiving

Do not deploy, merge, price, or start a subscription from the worker that prepared this branch.

## Feature off

Leave `MANAGED_WATCH_OPT_IN` unset or `0`. No `/api/managed-watch` route is mounted. Existing SDS routes stay on their current handlers. Foundry serving-runtime and `materialize-runtime.mjs` are not invoked by this adapter. No watch timer is armed. Idle startup does no customerless watch query.

## Activation

The process needs the existing correspondence database URL. Grants already live in `pilot_correspondence.correspondence_grants`. This adapter adds only `correspondence_l12_managed_watch` on first enabled open. It does not migrate foundry invocations and does not charge the original 8/8 QA allocation.

```bash
# on the receiving host, not from this worker
export MANAGED_WATCH_OPT_IN=1
export CORRESPONDENCE_DATABASE_URL=postgres://.../correspondence
# optional; arms one timeout only while a scheduled customer task exists
export MANAGED_WATCH_SCHEDULER=1
node server/index.js
```

There is no `setInterval`, recovery heartbeat, resource patrol, bot message, or model call. Enrollment, resume, pause, cancel, and due replan the one scheduler when it is enabled. Health `scheduler` reports `enabled`, `armed`, and `nextDueAt`. A cadence longer than the platform timer limit wakes once to rearm; it does not loop. When more than one host opens the same Postgres store, set a distinct `MANAGED_WATCH_HOST_ID` on each host. Recovery follows that lease identity and the durable version check. A process id is only a same-host hint. With the scheduler unset, due work runs only when Root's supervisor calls the granted due route:

```bash
node server/lib/managed-watch/client.mjs due --base https://samedaydesk.com --token-file /secure/grant.token
```

The token file is mode 0600. A reader grant can retrieve. An owner or writer grant enrolls, pauses, resumes, cancels, and runs due for that project only.

## Migration

Additive table only. No backfill and no copy of foundry invocation rows. Enrollment starts at `scheduled` and does not read until a due claim. Existing pause, cancel, unchanged-negative, and unknown-delivery behavior stays inside the pinned change-monitor state stored on the watch row.

## Rollback

1. Unset `MANAGED_WATCH_OPT_IN` and `MANAGED_WATCH_SCHEDULER`.
2. Restart the SDS process. Routes other than the removed watch prefix match the previous process.
3. Optional drop, only after Root decides the rows are disposable:

```sql
DROP TABLE IF EXISTS pilot_correspondence.correspondence_l12_managed_watch;
```

Do not drop `correspondence_grants` or any `correspondence_vf04_*` table. Do not mint a refill.

## Later-caller receiving

```bash
node server/lib/managed-watch/client.mjs healthz --base https://samedaydesk.com
node server/lib/managed-watch/client.mjs enroll --base https://samedaydesk.com --token-file ./grant.token --body-file ./enrollment.json
node server/lib/managed-watch/client.mjs get --base https://samedaydesk.com --token-file ./grant.token --task moltjobs-hold
```

Health must report `paidServiceLaunch: false` and `subscriptionOffered: false`. A separate process, after the enrolling process has exited, uses `get` and receives the retained baseline or later result. Price publication stays with Root. This package records `proposedManagedPrice: null`.

Provider marginal cost, model tokens, savings, and profit are unknown. Measured fields are source calls, source bytes, storage bytes, and runtime milliseconds on the watch row.
