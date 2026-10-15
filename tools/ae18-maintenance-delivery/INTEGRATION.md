# Root / 242001 integration handoff

The accepted runtime is Neo `services/machine-gateway` at
`7e5078bbf213ae3d1ff8d4638199ff8d1d1d81a8`. This package consumes its
`RouteRegistry`, `MachineGateway`, `SqliteStore`, raw HTTP handler, and
`POST /v1/quote`, `POST /v1/execute`, `GET /v1/receipts/{id}`. It never uses the
older 728f27ec contract. Routes have closed top-level schemas, zero prices,
15-second provider deadlines and 256 KiB outputs. No payment adapter is loaded.
Gateway `/v1/test` remains a labelled fixture, not acceptance evidence.

The provider context contains only `{signal, receiptId}`. It does **not** carry
authenticated tenant identity. Deployment therefore assigns one unique route
pair per finite occurrence and validates that only the configured owner can
assess and only a separate configured reviewer tenant can review. Root must
merge these definitions and scopes into the common registry. Mounting a second
gateway at the same prefix is not supported. `assertRouteScopes` refuses foreign
route grants. Reviewer labels must match current private rights configuration.
Labels alone are not authentication: gateway bearer authority supplies it.

First-admission protection uses the current public `SqliteStore.transaction`,
`store.db.prepare(...).get(...)` read surface and `store.receipt(tenant,id)`.
It reads existing `attempts` joined to `quotes`, ordered by SQLite rowid, to find
the first admitted phase. All writes and recovery remain gateway-owned; there
are no new tables, migrations, money stores or journals. This read contract is
pinned to gateway schema v1. A future gateway receipt-lookup method could replace
the read with `firstReceipt({tenant,routeId})`; Root/gateway owner must preserve
first admission and input-digest conflict semantics. A failed first phase seals
that finite phase. Reconciliation/new owner-authorized occurrence is required;
changing keys cannot obtain another observation or flip a review decision.

Callable package exports (242001 owns joined dispatch):

- `prepareInputs({sdsRoot,gatewayRoot,merchantRoot})` verifies pinned bytes and
  loads the existing template/recipe/projection/merchant/runtime.
- `createGatewayRoutes({inputs,store,descriptorPath,rightsPath,priorPath,
  ownerTenant,reviewTenant,mountedOrigin})` returns `{operations,routes}`.
- `operations.assess({descriptorDigest},{signal})` and
  `operations.review({assessmentId,assessmentDigest,taskId,sourceDigest,
  decision,reviewer})` are provider callables. Use gateway dispatch for durable
  effects, authorization and finite admission. Calling core operations directly
  is assessment computation, not a persisted handback.
- `createReadOnlyCheck(options)` returns an async GET-only source check with
  `due`, `disposition`, `binding`, `assessment`, `execute:false`. It admits no
  gateway receipt, creates no schedule and cannot accept/review work.
- `executeSaved` and `readback` from `./client` implement the cold consumer.
  Inputs, credential digest, quote and key are fsynced before execution; resume
  reuses the identical request. An empty/truncated saved state fails closed.
- `descriptorSchema`, `rightsSchema`, `assessInputSchema`, `reviewInputSchema`,
  `bindingSchema`, `outputSchema` are exported from `./schemas`.

Integration example in the existing host, before its JSON parser:

```js
import { prepareInputs, createGatewayRoutes, assertRouteScopes }
  from '@samedaydesk/maintenance-delivery';
const inputs = await prepareInputs(config.inputs);
const { operations, routes } = createGatewayRoutes({
  inputs, store: existingGatewayStore, ...config.maintenance
});
assertRouteScopes(existingTenants, operations,
  config.maintenance.ownerTenant, config.maintenance.reviewTenant);
// Root combines these with its existing definitions, then constructs the ONE
// current RouteRegistry/MachineGateway and mounts its existing raw handler.
const registry = new inputs.gateway.RouteRegistry([...existingRoutes, ...routes]);
```

For a host without an existing gateway mount, `src/runtime.mjs` exports
`mountMaintenance(app, config)` using the exact gateway mount pattern. It opens
no extra listener. The included loopback listener is a disposable acceptance
entry only. No master CLI, registry file, scheduler or `ae` plugin is added.
The read-only CLI/discovery source at Neo
`85075d36578740d8cad659b7a5c44da32517e6c9` exposes the existing `ae` artifact
and documented commands; it supplies no extension registration contract for
this operation. 240100's copy and 242001's dispatch remain theirs.

Neo monitor at `0ad6691f79225cfba782971a910c0e79d371c8f3` has fixed modes
`http`, `json`, `observatory`. Its `src/worker.mjs:tick` always calls its bounded
GET/normalizer; `src/api.mjs` has monitor/delivery APIs, with no callable arbitrary
check hook. Nothing is installed or scheduled here. Monitor owner would need a
check-registration interface accepting the callable above and an existing
owner-authorized config reference, then emit its ordinary immutable observation
and delivery. It must not automatically approve, pay, or schedule a second paid
task. Root should not pretend current configuration supports this join.

The current source transport supports one exact explicitly configured owner
loopback origin, no redirects, credentials, queries, fragments, >64 KiB bodies
or non-JSON content. Root/monitor owner must connect an existing DNS-pinned
public acquisition transport before external public source operation; this
package does not fork public fetch or loosen the gateway's SSRF rules.

E01 repeat semantics and E06 economics were read at their exact specified pins.
Retained reuse has paid-task increment zero. The E11 20-atom/1-atom fee is a
labelled quote only; gross, fee and rail cost are not spend. Effort, complete
review burden, cash cost and lowest reliable reward stay unknown. Historical
221400/234100 terms are untouched. No PG/chain join, H1 installation, live funds,
external repair artifact or production-serving evidence was supplied or claimed.
Next owners: Root receives/mounts; 242001 dispatches; monitor owner integrates
checks if explicitly installed; E02 supplies any repair; H owner handles any
future canonical chain/PG acceptance.
