# VF12 entry → contribution → later reuse

Optional binding of received VF10 private entry to the existing VF09 receiver.
No server, migration, profile installation, worker, grant or public scope is
activated merely by importing this module. See [the result](../ENTRY-RESULT.md)
and [Heavy's delta](../VF12-HEAVY-RECEIVING-DELTA.md).

`createEntryReuseMount` composes the existing bounded correspondence app and the
canonical foundry router. `EntryReceiver` binds `begin` and read-only `read` to an
exact charged registration, project, immutable entry terms, installed evaluator
and aggregate host configuration. The private `recover` operation completes an
already reserved admission or fences an absent begin with a declined tombstone.
It never replays an unknown begin or mints another grant.

The original installation row and charges remain. `enableContribution` installs
one immutable addon profile; original v1 registrations keep their exact private
scope, event budget, grant rows and retries. A new profile alias is not a budget.
The host example reserves four finite allocations and one physical execution
slot across them. See `hostProfile().aggregate`; the examples are explicit QA
choices, not caller-specific rules or production defaults.

Reproduce with the existing private PG16 extraction and pinned VF08 runtime:

```sh
npm run build --prefix services/correspondence
node scripts/visitor-foundry/integration/run-local.mjs entry
```

The runner fails if PG/runtime/toolchain is missing. It uses a disposable cluster,
separate hosts mounted under `/api/correspondence`, separate CLI processes, real
SIGKILL, canonical SQL transitions and maintained C/Wasm execution. Do not run
alongside the VF09 compound drift test, which changes/restores runtime files.

A cold visitor's private config is exactly:

```json
{
  "baseUrl": "https://existing-host.invalid/api/correspondence",
  "directory": "/private/visitor-continuation",
  "authority": {
    "profileId": "vf10:contribution-v2",
    "entryTerms": "sha256:<exact-standing-authority-hash>",
    "contributionTerms": "sha256:<exact-standing-authority-hash>",
    "scope": "synthetic-reusable-components"
  }
}
```

Actual hashes must be agreed standing authority; reading a descriptor is not
consent. The CLI has no host/operator key. It persists a private proof and exact
entry attempt before POST; tokens are derived in memory. VF05 identity is an
HMAC purpose-separated by registration and both terms. Its replay seals still
bind origin, tenant and grant fingerprint. Every mutation intent and invocation
body is fsynced before send. Hint/continuation output contains no bearer token.

```sh
node scripts/visitor-foundry/integration/entry/visitor.mjs register CONFIG.json
node scripts/visitor-foundry/integration/entry/visitor.mjs checkpoint CONFIG.json TEXT.json
node scripts/visitor-foundry/integration/entry/visitor.mjs use CONFIG.json TASK.json
node scripts/visitor-foundry/integration/entry/visitor.mjs contribute CONFIG.json TASK.json
node scripts/visitor-foundry/integration/entry/visitor.mjs reconcile CONFIG.json
node scripts/visitor-foundry/integration/entry/visitor.mjs reconcile-contribution CONFIG.json OPERATION.json
node scripts/visitor-foundry/integration/entry/visitor.mjs resume-contribution CONFIG.json HINT.json
node scripts/visitor-foundry/integration/entry/visitor.mjs renew CONFIG.json
node scripts/visitor-foundry/integration/entry/visitor.mjs withdraw CONFIG.json WITHDRAWAL.json
node scripts/visitor-foundry/integration/entry/visitor.mjs correspondence CONFIG.json
node scripts/visitor-foundry/integration/entry/visitor.mjs decline CONFIG.json TASK.json
```

All input JSON files use 0600. TEXT is `{text:string}`; OPERATION selects an
already persisted `create|claim|checkpoint|submit`; HINT is the existing VF05
`participation-hint.v1`; withdrawal binds `cellId,expectedRevision,reason` and
`fence` when the existing lease requires it. Decline works before registration
and returns the original supplied result unchanged. A pending/declined receiver
still permits private correspondence; `use` returns the supplied original input
and no invented invocation. Ready pools retain normal typed canonical failures.

One private directory contains one exact contribution task. Resume/reconcile
existing intents there; do not overwrite them, infer mutations from a public
hint, or create a fresh registration after refusal. `use` persists an invocation
by full request hash and replays that exact manifest/request after lost ACK.
Changing task, source, scope, origin or terms requires deliberate caller action,
never automatic widening. Grant renewal preserves IDs and scope until the fixed
workspace deadline; revocation is final. Contribution evidence renewal remains
the existing private operator lifecycle, not visitor authority.
