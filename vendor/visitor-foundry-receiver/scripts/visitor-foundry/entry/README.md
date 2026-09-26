# Bounded unattended visitor entry

An optional public-entry adapter over real correspondence projects/grants. A
visitor can browse without identity proof, persist a local secret and exact
attempt, enter a finite private workspace, then return using its own continuation.
The host installs a finite cohort; no wallet, email, phone, OAuth, payment or
manually issued visitor token is involved. VF04 execution enrollment stays gated.

Read [CONTRACT](CONTRACT.md), [RESULT](RESULT.md) and the detailed
[Heavy receiving plan](HEAVY-RECEIVING-PLAN.md).

From the Neo repository root on the assigned remote VM:

```sh
npm ci --prefix services/correspondence --ignore-scripts
npm run build --prefix services/correspondence
npm run build --prefix scripts/visitor-foundry/entry
npm test --prefix scripts/visitor-foundry/entry
```

Acceptance requires local PostgreSQL 16 binaries and fails if absent. Override
`VF10_PG_BIN` for another installed binary directory. The harness starts a temporary
loopback cluster and independent server/client processes, uses no provider login,
and removes its cluster afterward. It does not use a shared database or skip
missing runtime. Run as the VM's ordinary user, not PostgreSQL-disallowed root.

An already authorized unattended caller uses an installed host like this. The
origin below is illustrative; no deployment was performed by this assignment.
`ENTRY_TERMS_HASH` is the exact descriptor hash allowed by the caller's standing
scope, not an instruction to accept arbitrary changed terms.

```sh
ENTRY_BASE='https://samedaydesk.com/api/correspondence'
ENTRY_STATE='/private/local/visitor-continuation'
node scripts/visitor-foundry/entry/cli.mjs describe "$ENTRY_BASE"
# Supply the exact machine-authorized profile and terms hash from that descriptor.
node scripts/visitor-foundry/entry/cli.mjs prepare "$ENTRY_BASE" "$ENTRY_STATE" \
  vf10:private-v1 "$ENTRY_TERMS_HASH"
node scripts/visitor-foundry/entry/cli.mjs register "$ENTRY_STATE"
node scripts/visitor-foundry/entry/cli.mjs checkpoint "$ENTRY_STATE" /private/local/synthetic-checkpoint.txt
# A later fresh process, with no transcript:
node scripts/visitor-foundry/entry/cli.mjs resume "$ENTRY_STATE"
# If a registration response was lost:
node scripts/visitor-foundry/entry/cli.mjs reconcile "$ENTRY_STATE"
# Only when the original grant requires bounded renewal:
node scripts/visitor-foundry/entry/cli.mjs renew "$ENTRY_STATE"
```

`prepare` makes no mutation call. It writes/fsyncs the private proof and attempt
first. An exact repeated checkpoint command reuses its one saved intent. The small
CLI intentionally demonstrates one resumable checkpoint; applications can use
`resumedCorrespondence()` with their own persist-before-send event intents.
Credentials never appear in the CLI output or URL. Declining requires only POST
`/v1/visitor-entry/decline` with `{}` and returns `continue_original`.

The actual acceptance test runs this sequence under `/api/correspondence` using
fresh CLI processes, kills/restarts the HTTP service, and verifies Postgres rows.
The example profile is installation data, not activation. Only Root owns actual
host environment, database migration and deployment decisions.
