# Heavy receiving plan: portable participation

Receive VF05 only as the client/embedding layer after reviewing VF04A. This branch
contains no durable receiving implementation and no public rollout. The exact
production gap conversion, receipt admission, publication, restart recovery and
validity decisions belong to VF04A. Its checkout was never accessed or changed.

## 1. Receive the exact source and verify ownership

Repository `epistemedeus/neomorphic-io`; branch
`codex/visitor-participation-20260926`; owned path
`scripts/visitor-foundry/participation/`. Base assembled head `bb5e61a` contains:

- baseline `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`;
- VF01 `5c38974c28c3c376f2cdd90a91c91e67eb7d00b5`;
- VF02 `47fe95ceaba28f6b87e9b4efc8b202b5ffaf1a5f`;
- VF03 `2689a197786cead5bcf3476f63aa14fe5da46d44`.

Take only this owned module if VF04A's integration tree already has the parents.
Do not replace newer foundation source with these pins. Verify the final remote
tip reported by the delivery response, then inspect
`git diff bb5e61a..TIP --name-only`. Every path must start with the owned prefix.
Check existing contributor source before adapting public routes. None of the
homepage, paid offering, shared foundation or correspondence files changed here.

The implementation reuses VF01 resolve/createGap and package adaptation;
contributor-desk's exact hash-terms predicate and public task projection;
contributor-session-grant's token fingerprint and secret-free file helpers;
correspondence origin/bounded-response functions; and compiled VF02 commandSchema.
`WorkCellClient` was inspected: its file-persisted retry contract informed the
stateless port, but its state files are not imported as a new foundry store.
VF03 source was read for independent admission and cost semantics; the portable
client exposes no verifier/disposition/promotion methods.

## 2. Preserve the application contract at each host

Read `src/index.d.mts`, `schema/participation.v1.json`, and
`schema/negotiation.v1.json`. The envelope ID is
`neomorphic.foundry.participation.v1`. Negotiate that explicit application version
and a subset of four modes with a caller-declared budget. The budgets currently
filter at 15/60/300/900 seconds; they are menu thresholds, not promised task times
or grants to hold a lease for that duration.

| Existing host | Supplied boundary | Receiving change |
| --- | --- | --- |
| Capability/preflight service | Existing HTTP result/status/headers/stream | Keep original response; attach a negotiated sidecar through the existing host mechanism |
| Contributor/discovery tool owner | Explicit machine tool result | Preserve original result and actionability; application wrapper only for callers accepting v1 |
| Cold local caller | Original CLI stdout/stderr/exit code | Keep bytes and code; write sidecar to a separately selected file/descriptor |
| Ordinary public discovery | Existing `/api/lab/capabilities.json` | Continue returning ordinary discovery; participation is optional and not a new catalog |

Do not treat a generic 404, an auth failure, 429, temporary outage, unknown
compatibility or incomplete coverage as missing demand. Invoke host-local
`assessVF01` with an authenticated/materialized VF04 resolver snapshot and its
host-owned admitted policy, explicit typed permission, cleared request and gap
proposal. It calls real VF01 `resolve/createGap`. Never accept admission IDs,
coverage assertions, permissions or a serialized assessment as caller authority.
The public envelope omits raw VF01 diagnostics and request/input hashes.

Map service failures using their explicit categories, not exception text. The
service failure category takes precedence over an unrelated gap assessment.
Keep actionability and funding from the maintained source. A demo or historical
OPEN label cannot become actionable, funded or completed because a contribution
was offered. Unknown costs stay null; known money remains integer units and a
currency. Funded participation remains disabled in this client foundation until
an existing authorized funding path is deliberately wired.

When participation validation fails, adapters preserve the original result and
omit the optional sidecar. The direct core throws fixed diagnostic codes for
host development. Do not log the original exception or entire wrapper publicly.
No contribution decision may gate the existing service response or paid route.

## 3. Clear input before projecting or identifying it

Host owns public template IDs and declarative field allowlists. Decide metadata
versus reproducer scope before touching task values. Metadata returns no task
values, value digests or nested diagnostic paths. Reproducer scope requires
`{provenance:'synthetic'|'authorized',authorizationRef}`. Synthetic data must
actually be synthetic; a marker is not automatic sanitization. Authorized data
must match the specific permission and intended recipient scope.

Use `buildReproducer` with a host-maintained template, never a template invented
from secret input keys. Fields are bounded scalars, objects and arrays. Do not
add regex programs, expressions, shell commands or arbitrary contributed test
execution. Preserve the exact source/artifact digest separately from local runtime
state. The host stores approved artifacts through its existing immutable artifact
path and passes references; VF05 neither uploads to arbitrary URLs nor creates
an artifact registry. Reference URLs and test proposals are inert data.

Use `semanticIdentity` with an existing host-owned, per-tenant secret. Canonical
object order is stable; array order remains semantic. The public identity must
not be SHA256(private input). Scope it before issuing a response. Keep purpose
separation when deriving key material from an existing host secret. Keys must
not be supplied by public callers or embedded in hints, documents or URLs.
Decide host key rotation/retention before enabling resume; key changes invalidate
local intent seals, and recovery then requires authenticated server readback.

Do not include prompts, agent history, bearer values, local environment files,
user paths or raw exceptions in a proposal. Treat template/ref/task labels as
cleared host metadata too; an identifier can leak a secret if the host copies it
from a private value. `safe.mjs` is bounded JSON validation, not a JavaScript
sandbox for proxies or hostile executable objects.

## 4. Wire the narrow VF04 port after its review

`vf04Port(hostMethods)` is a proposed adapter contract, proven with injected
contract tests only. It does not name a live route. Heavy should implement
`hostMethods` against the accepted VF04A API and existing host auth. Do not create
a parallel server, lease state machine, journal or miss-to-cell converter.

Every mutation receives `{cellId,requestId,termsVersion,body}`. Host auth/project
scope is bound in the injected method closure, not in a continuation hint.
`requestId` is a stable keyed opaque ID derived from exact intent and binding.
The server must enforce authorization and current terms atomically with its
existing revision/fencing/idempotency transaction, including replay after restart.
Local seal and preflight term equality do not replace that transaction.

| Operation | Exact proposed body | Existing authority to reuse |
| --- | --- | --- |
| create | `proposalRef,resolverRef,reproducerRef,fundingKind` | VF04A resolves pinned approved artifacts, rechecks the genuine miss and scope, and creates/deduplicates through VF02 |
| claim | `expectedRevision,ttlSeconds,voluntaryOptIn:true` | VF02 grant, revision, bounded lease and fence |
| checkpoint | `expectedRevision,fence,checkpointRef` | VF04A loads the exact approved checkpoint descriptor; VF02 persists it |
| submit | `expectedRevision,fence,contributionRef` | VF04A loads the pinned contribution, preserves rights/source/tests/limits and submits through VF02 |
| read | `{cellId}` | Existing authenticated scoped readback; no mutation |

Artifact refs are `{uri,digest}`; digest is full SHA-256, URI HTTPS with no
userinfo, query or fragment. VF04 body refs must name already approved immutable
records. Metadata-only gap reporting must use a server-owned scoped template or
cleared metadata reference; do not manufacture a reproducer or derive raw input
from a lookup. A report does not claim that the visitor supplied a counterexample.

The proposed mutation receipt is
`{schema:'neomorphic.foundry.participation-receipt.v1',requestId,operation,
termsVersion,cellId,revision,replayed}` plus optional server data. It must match
exact request/operation/terms/cell and expected resulting revision (create: 1,
otherwise previous+1). Read returns at least the bound `cellId,revision`.
Additional server fields stay host-private and are never executed. If VF04A
already exports an equivalent receipt, map it here without changing its shared
schema. Any necessary shared change is a small receiving note plus a contract
vector; it is not another backend implementation.

VF01 and VF02 gap shapes intentionally differ: VF01 has numeric revision 1 plus
contentId, resolver hash bindings and permission `authorized`; VF02 uses a digest
revision, immutable artifact refs and `authorized-reusable`. VF04A owns this
conversion. The test-only mapping in `tests/pg/integration.test.mjs` proves the
VF02 seam with real PG but is not an accepted production gap mapper.

## 5. Keep resumable interaction local and optional

`prepare` requires explicit consent for one operation, enforces mode, validates
the command and records exact terms. It sends nothing. Persist the intent before
POST if the caller needs cross-process recovery. The shipped CLI uses the
existing exclusive 0600 secret-free writer. There is no authoritative local cell
state: the durable cell, receipts and deduplication remain on VF02/VF04.

A lost ACK, empty success, unexpected redirect, invalid receipt, stalled body or
transport error yields unknown outcome. Do not manufacture another request ID.
Reconcile the exact sealed intent with the original origin/tenant/grant and then
GET current state. A historical success may describe an expired lease; it does
not authorize new work. Cross-grant replay, altered terms/body, foreign origin or
forged public hint cannot create a mutation through this session interface.

If a bearer is revoked/expired, a valid local intent cannot resurrect it. Use the
host's existing authorization path and fresh readback. Do not copy the old fence
into a new grant, mint a grant from a hint, or silently re-sign an old intent.
For VF02 direct use, `currentTerms` is the immutable gap `contentId` on authenticated
read. VF02 does not gain commercial terms authority from this adapter. VF04 host
must supply its accepted exact agreement version and check it transactionally.

The CLI intentionally has no `grant`, `publish`, `verify`, `pay`, `deploy`, remote
command or URL execution command. It never reads owner credentials from the
environment. Its config is host-local, not a public tool argument.

## 6. Repeat acceptance on the receiving tree

Use the current repository's locked packages; do not install a new SDK or runtime.
From repository root (all commands were run on the remote VM):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix services/correspondence --ignore-scripts --no-audit --no-fund
npm run build --prefix services/correspondence
npm ci --prefix packs/terms-lifecycle --ignore-scripts --no-audit --no-fund
npm ci --prefix inputs/pilot-task-memory-20260909 --ignore-scripts --no-audit --no-fund
npm run build
npm test --prefix scripts/visitor-foundry/participation
node scripts/visitor-foundry/participation/scripts/disposable-pg.mjs
node scripts/visitor-foundry/participation/scripts/privacy-check.mjs
node scripts/visitor-foundry/participation/scripts/schema-conformance.mjs
node scripts/visitor-foundry/participation/scripts/reuse-check.mjs
services/correspondence/node_modules/.bin/tsc --noEmit --strict --skipLibCheck --module nodenext --target es2022 scripts/visitor-foundry/participation/tests/types.mts
npm test --prefix packs/contributor-session-grant
npm test --prefix packs/contributor-desk
npm test --prefix packs/terms-lifecycle
npm test --prefix packs/capability-preflight
npm run test:capability-market
node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs
```

Supply PG16 binaries for the disposable runner. It creates its own cluster with
24 connections, 32 MiB shared buffers, fsync/synchronous_commit enabled; it never
uses a supplied production DATABASE_URL. VF02 helpers boot the actual separately
forked Express/correspondence/PG stores. They issue only disposable test-project
grants in that private cluster. This is not credential provisioning for a live
service. Use owned TMPDIR/cache paths to avoid unrelated test artifacts.

The three PG tests cover: a separately forked preflight HTTP owner running the
real maintained function and VF01 resolver; negotiated and ordinary result
round trips; a fresh CLI receiving actual built ordinary discovery; genuine
VF01 miss into real VF02; dropped create ACK
and fresh CLI reconciliation; fresh CLI read; SIGKILL/restart of the HTTP host;
checkpoint recovery; submission and replay; tenant isolation; revoked grant;
two concurrent claimants with one winner; reader mutation denial; stale fence;
and ACK loss/replay for create, claim, checkpoint and submit with exactly four
committed receipts. A restart on a different loopback port uses a fresh host
binding; it does not rewrite old sealed intents. Receiving host acceptance must
also repeat loss-of-ACK across restart at the real stable bound origin.

Before rollout, replace the injected VF04 fixture in port tests with the actual
receiving adapter and replay the same vectors. Add server-enforced stale terms
under a race, ACL changes during replay, current grant expiry, semantic duplicate
proposals from distinct clients and resolver snapshot invalidation between offer
and create. Verify all those paths reach the existing VF04A transaction. Run its
own durable admission/publication/correction tests; VF05's tests cannot prove
that combined rollout. Require the independent receiving review already planned
by Root, using actual source and receipts rather than worker claims.

## 7. Measure and release through the existing host process

`examples/frozen-tasks.json` was committed at checkpoint cbb3d9e before tests;
its immutable digest is in `evidence/reuse.json`. Its `frozenAt` is the declared
synthetic fixture clock; Git checkpoint is the actual freeze receipt. There are
two original tasks and two later tasks, all owner-controlled. Preflight still
returns unknown for unsupported tilde syntax. The desk still lacks requested
funding freshness. Optional reports do not solve those original gaps or publish
a new capability. Later checks import and execute existing maintained functions
at the exact baseline pin. Both later checks pass; no claim of contribution-caused
improvement is made.

The fixture records additional scripted sharing choices and serialized projection
bytes: preflight two choices/242 bytes/two input fields, desk one choice/173 bytes/
zero input fields. These are projection measurements, not human timings or total
HTTP/storage costs. Actual effort, validation cost, maintenance cost and unknown
independence must remain explicit. Do not count a view, download, submission,
acceptance or local later check as external adoption, revenue or payment.

Heavy should add host telemetry for offer/decline/scope selection, actual extra
steps/bytes, exact artifact refs, accepted contribution, distinct later useful
outcome, source relationship, costs and maintenance. Keep original service result
and participation outcomes separate. Freeze held-out later needs before measuring
any newly accepted improvement. Count failures, declines and zero-reuse artifacts.
Use VF03's established observation/cohort contracts and host-authenticated outcome
sources, preserving unknown cost and relationship classes.

Only after VF04A and host adapter acceptance, enable a reversible existing-host
feature flag for a bounded nonfinancial cohort. No release was performed here.
Rollback disables offers/dispatch while preserving original service results and
server records; existing authenticated read/reconciliation remains available.
No migration rollback, cell deletion, new deployment stack, homepage redesign,
provider login, payment rail or contribution-required access is proposed.
