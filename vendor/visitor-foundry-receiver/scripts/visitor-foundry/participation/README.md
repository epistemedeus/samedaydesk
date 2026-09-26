# Portable optional participation

VF05 is a Node 22 client/embedding layer for a service that encounters a genuine,
permission-cleared capability gap. It preserves the original service result and
lets a caller choose a small contribution. It does not implement a registry,
store, grant issuer, lease engine, verifier, payment system or hosted route.

The branch owns only this directory. VF01/02/03 are pinned read-only inputs;
VF04A owns durable receiving integration. See [RESULT.md](RESULT.md) for measured
acceptance and [HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md) for host work.

## Use the core at an existing boundary

```js
import {
  ENVELOPE, assessVF01, httpBoundary, buildReproducer,
} from './scripts/visitor-foundry/participation/src/index.mjs';

// Host-owned snapshot and admission policy. Request contains only cleared data.
const assessment = assessVF01({
  snapshot, request: permissionClearedRequest, options: hostResolverOptions,
  permission: { provenance: 'synthetic', authorizationRef: 'fixture:approved' },
  gap: {
    gapId: 'gap:host-assigned',
    reproducer: { ref: 'artifact:approved-reproducer', permission: 'synthetic' },
    funding: { kind: 'voluntary', ref: null },
  },
});
const { response, participation } = httpBoundary(originalResponse, {
  accepts: [ENVELOPE], modes: ['report-gap', 'counterexample'], budgetSeconds: 60,
}, {
  assessment, condition: 'resolved',
  disclosure: {
    actionability: 'not-actionable',
    rights: { status: 'allowed', ref: 'rights:approved-scope' },
    funding: { kind: 'voluntary', ref: null },
    cost: null, termsVersion: pinnedTermsDigest,
  },
});
// response is the exact original object; no stream consumption or status change.
// Send the sidecar only through a host surface that negotiated this application schema.
```

`assessVF01` calls the actual `resolve` and `createGap`; it does not duplicate gap
classification. Its assessment object is host-local and cannot be forged by
sending a serialized `{status:'genuine-miss'}`. The explicit permission assertion
is host provenance, not automatic rights verification. Never feed prompts,
history, raw exceptions or uncleared original requests into the resolver.

`conditionFromHttp(404)` returns unknown. Auth failure, quota pressure and an
outage suppress offers even when a separately supplied resolver assessment was a
miss. Complete coverage and a genuine VF01 gap are necessary to offer modes.
Unknown/denied rights or funded/unknown funding suppress this nonfinancial path.
Actionability, rights, funding, unknown cost and exact hash terms stay separate.
The discovery/paid service is never gated on contribution.

`jsonBoundary` and `toolBoundary` return the exact legacy value if no supported
schema was negotiated. With negotiation they wrap it in a sidecar structure.
`httpBoundary` returns `{response, participation}` and `cliBoundary` returns
`{original, participation}`; these preserve response streams and CLI bytes/exit
codes. Optional adaptation failures omit the sidecar. Direct `negotiate` validates
strictly and throws static codes. Nothing appends JSON to old CLI stdout or
inserts fields into an old HTTP body without negotiation. The machine tool
wrapper is an application result, not an official MCP extension. No MCP SDK,
frontend, model call or new discovery registry is used.

## Choose scope before copying input

```js
const template = {
  id: 'template:engine-v1', fields: {
    range: { type: 'string', maxLength: 80 },
    nodeVersion: { type: 'string', maxLength: 40 },
  },
};
const metadata = buildReproducer({ template, input: localTask });
const synthetic = buildReproducer({ template, input: syntheticTask, sharing: {
  scope: 'reproducer', provenance: 'synthetic', authorizationRef: 'fixture:approved',
} });
```

Metadata never traverses or hashes `input`; it contains the public template ID
and null fields/provenance. Reproducer scope requires explicit synthetic or
authorized provenance and an authorization reference. Fields use an allowlist:
unlisted input properties and getters are not read; missing listed fields fail
with static codes. Nested objects/arrays are supported declaratively, without
scripts, regex expressions, interpolation or arbitrary test execution.

`semanticIdentity({tenantId,identityKey,proposal})` HMACs canonical cleared data
using a host-owned per-tenant secret. It is stable under object key order and
changes with tenant, key or semantic content. Never use a raw input digest or a
caller-selected public key as a private-value identifier. Keep the key local.
The existing host supplies key material; this module provisions no credentials.

Host configuration (templates, IDs, rights/terms/ref labels) must itself be
cleared. The library cannot discover a secret mislabeled as an authorized field.
Original private service results remain in their original host-local lane; only
the sidecar/projection may enter participation. Do not serialize the entire
`{original, participation}` into a public channel when `original` is private.

Limits: negotiation 4 KiB, general input 24 KiB conservative escaped-size budget,
2,048 nodes, depth 10; reproducer 16 KiB, nested rules depth 6, arrays at most 32,
strings at most 2,048 characters. Properties with accessors/prototypes/reserved
keys, sparse arrays, cycles, nonfinite values and functions are rejected. Errors
contain codes, never input values or property paths. These are JSON-data APIs;
hostile executable JavaScript proxies are not an isolation boundary.

## Resume through existing authority

`ParticipationSession` consumes a narrow injected port with
`validate/create/claim/checkpoint/submit/read`. `prepare` requires explicit consent
and returns a sealed intent containing the exact cleared command, terms and
origin/tenant/grant binding. It sends nothing. The caller may persist it before
`execute`; the CLI does so exclusively with mode 0600 using the existing
contributor-session-grant helper. There is no local cell database or journal.

An unknown acknowledgement stays unknown. `reconcile(intent)` replays the same
request identity/body against the same authenticated server. Always perform a
fresh `resume(continuationHint(cellId))` read before further work; historical
receipts do not extend a lease or supply a current fence. A hint only triggers
readback. It cannot be executed, sealed automatically, or used as a grant.
Changed origin, tenant, grant fingerprint or tampered commands fail before I/O.
Stale terms refuse dispatch. Reauthorization/key rotation requires a fresh host
read and deliberate new intent; old intents are not silently rebound.

`vf02Port` is separately imported from `src/vf02-port.mjs` after building the
existing correspondence service. It imports the actual VF02 `commandSchema` and
uses the existing VF02 HTTP endpoints. Only four contributor operations are
exposed. Server receipt/readback payloads are host-private data, not safe public
UI text. The CLI projects only status, cell ID, revision, replay and a read hint.
HTTP uses a fixed bound origin/path, manual redirect rejection, deadline and
bounded body. No reference/test description is fetched or executed.

`vf04Port(host)` is a proposed receiving contract with injected methods, tested
as a contract only. There is no invented VF04 endpoint or combined rollout. The
server must authorize every command, check current terms/revision/fence and
perform durable request/semantic deduplication. VF04 owns the VF01-to-VF02 gap
projection and artifact storage. The PG test's explicitly labelled projection
is a disposable fixture and is not exported as production mapping.

## Cold CLI and tests

```sh
node scripts/visitor-foundry/participation/cli.mjs discovery
node scripts/visitor-foundry/participation/cli.mjs help
npm run check --prefix scripts/visitor-foundry/participation
npm test --prefix scripts/visitor-foundry/participation
node scripts/visitor-foundry/participation/examples/run.mjs
node scripts/visitor-foundry/participation/scripts/privacy-check.mjs
node scripts/visitor-foundry/participation/scripts/reuse-check.mjs
```

Cold discovery points to the existing `/api/lab/capabilities.json`. With an
explicit `discovery HOST_BASE_URL` it fetches that fixed path and returns ordinary
discovery, with no grant or participation agreement. CLI `reproducer CONFIG.json` accepts
`{template,sharing?,inputFile?}`. Metadata does not open `inputFile`; reproducer
scope opens only the explicitly selected local file after checking permission.
The file is bounded to 32 KiB, then the declarative allowlist selects values.

For VF02 commands the host config is `{baseUrl,projectId,tokenFile,
identityKeyFile,termsVersion}`. Both secret files stay local. `termsVersion` for
create is host-provided; subsequent operations read immutable `cell.gap.contentId`.
VF02's voluntary gap revision is this adapter's scope agreement, not an invented
commercial terms authority. The command file is `{mode,operation,cellId?,
termsVersion,body}` where body is the actual VF02 command.

```sh
node scripts/visitor-foundry/participation/cli.mjs prepare CONFIG.json COMMAND.json INTENT.json --consent
node scripts/visitor-foundry/participation/cli.mjs execute CONFIG.json INTENT.json
node scripts/visitor-foundry/participation/cli.mjs reconcile CONFIG.json INTENT.json
node scripts/visitor-foundry/participation/cli.mjs resume CONFIG.json CELL_ID
```

Prerequisites for VF02 and schema checks: existing locked root/service packages,
`npm run build --prefix services/correspondence`. Full repository build and
contributor regression setup also require existing terms-lifecycle and pinned
task-memory packages. No new npm production dependency is introduced.

The PG embedding fixture serves the actual built discovery document, so run the
standard repository build first. For real PG tests, supply PostgreSQL 16 binaries via `VF05_PG_BIN` and any required
existing library path, or extract packages into owned `.local/pg/`. This run
copied VF02's already extracted PG 16 binaries into this directory, read-only at
source. It did not install system packages or touch VF04A. Then:

```sh
node scripts/visitor-foundry/participation/scripts/disposable-pg.mjs
```

The runner refuses ordinary `DATABASE_URL`, creates its own loopback cluster,
starts separate real correspondence/VF02 processes, runs three PG tests, stops
only its own processes and removes its own cluster. No production migration or
shared service is touched. See the receiving plan for exact commands and limits.
