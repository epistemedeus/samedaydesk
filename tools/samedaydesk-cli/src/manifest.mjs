// One versioned command manifest. help, commands, schema and the generated
// reference all read this table; nothing else lists commands.
export const MANIFEST_SCHEMA = "samedaydesk.cli.manifest.v1";
export const RESULT_SCHEMA = "samedaydesk.cli.result.v1";
export const ERROR_SCHEMA = "samedaydesk.cli.error.v1";
export const STREAM_SCHEMA = "samedaydesk.cli.stream.v1";
export const RECORD_SCHEMA = "samedaydesk.cli.readiness-record.v1";
export const DEFAULT_ORIGIN = "https://samedaydesk.com";
export const GATEWAY_PATH = "/api/machine-gateway";
export const MARKET_PATH = "/api/neomorphic-contributor-journey";
import { BATCH_LIMITS, BATCH_SCHEMA, batchOpsDescription } from "./batch.mjs";
import { CREDENTIAL_FLAGS, CREDENTIAL_SCOPE, CREDENTIAL_SOURCES } from "./auth.mjs";
import { EXIT } from "./errors.mjs";

const ORIGIN_FLAGS = {
  origin: { type: "string", required: false, description: "https origin. Default https://samedaydesk.com." },
  "allow-loopback": { type: "boolean", required: false, description: "Permit http://127.0.0.1 or http://[::1] for local tests." },
  "dry-run": { type: "boolean", required: false, description: "Return the validated request, effect and required authority without sending." },
};
const RECOVERY_FLAG = {
  "recovery-file": { type: "string", required: false, description: "Absolute path for a new 0600 recovery record written before the POST is sent. If it cannot be written, nothing is sent." },
};
const STATE_FILE_NEW = { type: "string", required: true, description: "Absolute path for a new 0600 state file (direct-client caller-state v1). Written with the idempotency key before execution." };
const STATE_FILE_EXISTING = { type: "string", required: true, description: "Absolute path of a state file written by gateway execute or the direct client (caller.mjs)." };
const TENANT_ERRORS = [
  { code: "paid_route_requires_payment_authority", when: "the tenant quote has a nonzero price; nothing is executed or paid", exit: 7, retryable: false },
  { code: "execution_pending", when: "receipt status running", exit: 11, retryable: true },
  { code: "execution_uncertain", when: "receipt status uncertain (deadline passed); never resent", exit: 10, retryable: false },
  { code: "execution_failed", when: "receipt status failed; evidence.receiptError holds the server code", exit: 15, retryable: false },
  { code: "readback_mismatch", when: "the receipt does not match the persisted request, input, route or quote", exit: 6, retryable: false },
  { code: "state_binding_conflict", when: "the state file belongs to another origin or credential", exit: 6, retryable: false },
  { code: "credential_required", when: "no --credential-file or --credential-stdin", exit: 3, retryable: false },
];
const ROUTE_ID = { type: "string", required: true, pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$", description: "Gateway route id from gateway routes." };

export const GROUPS = Object.freeze([
  { id: "discovery", summary: "Read this CLI's own command contract. Local, no network." },
  { id: "capabilities", summary: "Read current hosted capability, health and cost facts." },
  { id: "gateway", summary: "Machine-gateway routes: schemas, labeled fixture and anonymous quote preview." },
  { id: "market", summary: "Public machine-market profile and listing reads." },
  { id: "readiness", summary: "Free agent-readiness check with a saved, recoverable result." },
  { id: "tenant", summary: "Configured-tenant journey on the machine gateway: execute, resume and verified result. Needs an operator-enrolled credential." },
  { id: "batch", summary: "Bounded JSONL batches of the supported read and readiness operations with persisted per-item recovery." },
]);

const BASE_COMMANDS = [
  { id: "help", argv: ["help"], group: "discovery", summary: "Progressive help: groups, then one group's commands with usage.", effect: "none", auth: "none", positional: { name: "group", required: false, description: "Group id, for example readiness." }, flags: {}, output: "samedaydesk.cli.help.v1", retry: "not_applicable", recovery: "rerun" },
  { id: "version", argv: ["version"], group: "discovery", summary: "Package and manifest version.", effect: "none", auth: "none", flags: {}, output: "samedaydesk.cli.version.v1", retry: "not_applicable", recovery: "rerun" },
  { id: "completion", argv: ["completion"], group: "discovery", summary: "Print a shell completion script generated from this manifest.", effect: "none", auth: "none", positional: { name: "shell", required: true, enum: ["bash", "zsh", "fish"], description: "bash, zsh or fish." }, flags: {}, output: "text/plain (script on stdout)", retry: "not_applicable", recovery: "rerun" },
  { id: "commands", argv: ["commands"], group: "discovery", summary: "The complete command manifest.", effect: "none", auth: "none", flags: { group: { type: "string", required: false, description: "Only commands in this group." } }, output: MANIFEST_SCHEMA, retry: "not_applicable", recovery: "rerun" },
  { id: "schema", argv: ["schema"], group: "discovery", summary: "One command's inputs, output, effect, authority, route and recovery.", effect: "none", auth: "none", positional: { name: "command", description: "Command id, for example readiness.check." }, flags: {}, output: "samedaydesk.cli.command.v1", retry: "not_applicable", recovery: "rerun" },
  { id: "capabilities", argv: ["capabilities"], group: "capabilities", summary: "Gateway health and routes plus the market profile, each with its own status.", effect: "read", auth: "none", flags: { ...ORIGIN_FLAGS },
    http: [
      { method: "GET", path: `${GATEWAY_PATH}/healthz`, operationId: "gatewayHealth" },
      { method: "GET", path: `${GATEWAY_PATH}/v1/discover`, operationId: "discoverRoutes" },
      { method: "GET", path: `${MARKET_PATH}/v1/market/profile`, operationId: "machine.profile" },
    ], output: "samedaydesk.cli.capabilities.v1", retry: "bounded_get", recovery: "rerun" },
  { id: "gateway.routes", argv: ["gateway", "routes"], group: "gateway", summary: "Gateway routes with price, timeout, output bound and schema paths.", effect: "read", auth: "none", flags: { ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${GATEWAY_PATH}/v1/discover`, operationId: "discoverRoutes" }], output: "neomorphic.machine-gateway.discovery.v1", retry: "bounded_get", recovery: "rerun" },
  { id: "gateway.schema", argv: ["gateway", "schema"], group: "gateway", summary: "A route's input or output JSON Schema.", effect: "read", auth: "none",
    flags: { route: ROUTE_ID, kind: { type: "string", required: false, enum: ["input", "output"], description: "Default input." }, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${GATEWAY_PATH}/v1/routes/{route}/{kind}.schema.json`, operationId: "{route}_{kind}_schema" }], output: "json-schema", retry: "bounded_get", recovery: "rerun" },
  { id: "gateway.test", argv: ["gateway", "test"], group: "gateway", summary: "The route's labeled test fixture. No provider, payment or tenant.", effect: "fixture", auth: "none",
    flags: { route: ROUTE_ID, ...RECOVERY_FLAG, ...ORIGIN_FLAGS },
    http: [{ method: "POST", path: `${GATEWAY_PATH}/v1/test`, operationId: "testRouteFixture" }], output: "neomorphic.machine-gateway.test", retry: "none", recovery: "rerun; the server documents no effect" },
  { id: "gateway.quote", argv: ["gateway", "quote"], group: "gateway", summary: "Server quote for exact input (sent to the server; not a local preview). Anonymous: never executable, not a reservation. With a tenant credential: tenant-bound for 60 s, one execution per quote.", effect: "remote_quote", auth: "optional_tenant",
    flags: { route: ROUTE_ID, "input-file": { type: "string", required: true, description: "JSON input file, or - for stdin. At most 131072 bytes." }, ...RECOVERY_FLAG, ...CREDENTIAL_FLAGS, ...ORIGIN_FLAGS },
    http: [{ method: "POST", path: `${GATEWAY_PATH}/v1/quote`, operationId: "quoteRoute" }], output: "neomorphic.machine-gateway.quote", retry: "none", recovery: "rerun; an unused quote expires on the server after 60 s and cannot execute by itself",
    requiredAuthorityForNextStep: { execute: "tenantBearer (operator-enrolled; not self-serve)" } },
  { id: "gateway.execute", argv: ["gateway", "execute"], group: "tenant", summary: "Configured tenant: server quote, then execution with a persisted idempotency key, then verified receipt readback. Free routes only; a paid route stops before execution.", effect: "tenant_execute", auth: "tenant",
    flags: { route: ROUTE_ID, "input-file": { type: "string", required: true, description: "JSON input file, or - for stdin. At most 131072 bytes." }, "state-file": STATE_FILE_NEW, ...CREDENTIAL_FLAGS, ...ORIGIN_FLAGS },
    http: [{ method: "POST", path: `${GATEWAY_PATH}/v1/quote`, operationId: "quoteRoute" }, { method: "POST", path: `${GATEWAY_PATH}/v1/execute`, operationId: "executeBoundQuote" }, { method: "GET", path: `${GATEWAY_PATH}/v1/receipts/{id}`, operationId: "readPersistedReceipt" }],
    output: "samedaydesk.cli.tenant-result.v1", retry: "POST never retried; receipt GET bounded", recovery: "gateway resume --state-file: read back by receipt id, or resend the identical request with the persisted key",
    errors: TENANT_ERRORS },
  { id: "gateway.resume", argv: ["gateway", "resume"], group: "tenant", summary: "Recover a tenant execution from its state file (this CLI's or the direct client's caller-state v1): read back by receipt id, or resend the identical request with the same key.", effect: "tenant_execute", auth: "tenant",
    flags: { "state-file": STATE_FILE_EXISTING, ...CREDENTIAL_FLAGS, ...ORIGIN_FLAGS },
    http: [{ method: "POST", path: `${GATEWAY_PATH}/v1/execute`, operationId: "executeBoundQuote" }, { method: "GET", path: `${GATEWAY_PATH}/v1/receipts/{id}`, operationId: "readPersistedReceipt" }],
    output: "samedaydesk.cli.tenant-result.v1", retry: "POST never retried; receipt GET bounded", recovery: "rerun gateway resume", errors: TENANT_ERRORS },
  { id: "gateway.result", argv: ["gateway", "result"], group: "tenant", summary: "Read back and verify the receipt named in a state file. Never sends a POST.", effect: "read", auth: "tenant",
    flags: { "state-file": STATE_FILE_EXISTING, ...CREDENTIAL_FLAGS, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${GATEWAY_PATH}/v1/receipts/{id}`, operationId: "readPersistedReceipt" }],
    output: "samedaydesk.cli.tenant-result.v1", retry: "bounded_get", recovery: "rerun", errors: TENANT_ERRORS },
  { id: "market.profile", argv: ["market", "profile"], group: "market", summary: "Public machine-market source and capability fields.", effect: "read", auth: "none", flags: { ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${MARKET_PATH}/v1/market/profile`, operationId: "machine.profile" }], output: "c0-1 profile value", retry: "bounded_get", recovery: "rerun" },
  { id: "market.discover", argv: ["market", "discover"], group: "market", summary: "Public listings. --stream emits JSONL pages with a terminal record.", effect: "read", auth: "none",
    flags: { limit: { type: "integer", required: false, minimum: 1, maximum: 20, description: "Page size. Default 20." }, cursor: { type: "string", required: false, maxLength: 512, description: "Opaque cursor from nextCursor." }, "max-pages": { type: "integer", required: false, minimum: 1, maximum: 10, description: "With --stream. Default 3." }, stream: { type: "boolean", required: false, description: "JSONL output." }, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${MARKET_PATH}/v1/market/discover?limit={limit}&cursor={cursor}`, operationId: "machine.discover" }], output: "c0-1 discover value", retry: "bounded_get", recovery: "resume with --cursor nextCursor; on cursor_refused (exit 1) restart without --cursor",
    errors: [
      { code: "cursor_refused", when: "server answered with code cursor_refused (HTTP 400); evidence.server keeps the original code and body", exit: 1, retryable: false, nextAction: "market discover (restart without --cursor)" },
      { code: "cursor_malformed", when: "repaired market (mc1 cursors): the cursor is not one this server version could emit", exit: 1, retryable: false, nextAction: "market discover (restart without --cursor)" },
      { code: "cursor_unrecognized", when: "repaired market (mc1 cursors): well formed but not issued by this server, or no longer valid", exit: 1, retryable: false, nextAction: "market discover (restart without --cursor)" },
    ] },
  { id: "readiness.check", argv: ["readiness", "check"], group: "readiness", summary: "Free agent-readiness report for a public host. Same operation as MCP check_agent_readiness.", effect: "read", auth: "none",
    flags: { host: { type: "string", required: true, pattern: "^(?=.{1,253}$)[a-z0-9-]+(\\.[a-z0-9-]+)+$", description: "Public host, for example example.com." }, out: { type: "string", required: false, description: "Absolute path for a new 0600 result record." }, discovery: { type: "string", required: false, enum: ["mcp", "a2a", "llms-txt", "skill-md", "openapi", "registry", "search", "referral", "operator"], description: "Caller-declared acquisition label. Recorded as declared, never observed." }, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: "/agent-readiness?host={host}&format=json", operationId: "check_agent_readiness" }], output: "agent-readiness.report.v1", retry: "bounded_get", recovery: "result show --file OUT, or rerun the GET" },
  { id: "batch.run", argv: ["batch", "run"], group: "batch", summary: "Run a JSONL batch of supported reads. One JSONL record per item plus start and summary records; per-item state persisted before dispatch; rerun skips completed items.", effect: "read", auth: "optional_tenant",
    flags: {
      "input-file": { type: "string", required: true, description: "JSONL items file, or - for stdin. Each line: {\"id\"?: string, \"op\": string, \"args\"?: object}." },
      "state-dir": { type: "string", required: false, description: "Absolute 0700 directory for per-item recovery state and archived results. Required unless --dry-run. Reuse it to resume." },
      concurrency: { type: "integer", required: false, minimum: BATCH_LIMITS.concurrency.minimum, maximum: BATCH_LIMITS.concurrency.maximum, description: `Items in flight. Default ${BATCH_LIMITS.concurrency.default}, hard cap ${BATCH_LIMITS.concurrency.maximum}.` },
      "max-items": { type: "integer", required: false, minimum: BATCH_LIMITS.maxItems.minimum, maximum: BATCH_LIMITS.maxItems.maximum, description: `Refuse input past this many items. Default ${BATCH_LIMITS.maxItems.default}, hard cap ${BATCH_LIMITS.maxItems.maximum}.` },
      "max-line-bytes": { type: "integer", required: false, minimum: BATCH_LIMITS.maxLineBytes.minimum, maximum: BATCH_LIMITS.maxLineBytes.maximum, description: `Refuse a longer input line. Default ${BATCH_LIMITS.maxLineBytes.default}, hard cap ${BATCH_LIMITS.maxLineBytes.maximum}.` },
      "timeout-ms": { type: "integer", required: false, minimum: BATCH_LIMITS.timeoutMs.minimum, maximum: BATCH_LIMITS.timeoutMs.maximum, description: `Per-item deadline, reported as request_timeout. Default ${BATCH_LIMITS.timeoutMs.default}.` },
      ...CREDENTIAL_FLAGS, ...ORIGIN_FLAGS,
    },
    http: Object.entries(batchOpsDescription()).map(([op, value]) => ({ method: "GET", path: `(batch op ${op})`, operationId: value.operationId })),
    batchOps: batchOpsDescription(), limits: BATCH_LIMITS,
    output: `${BATCH_SCHEMA} (JSONL: type start, item, summary)`, retry: "bounded_get per item; no POST", recovery: "rerun with the same --state-dir: completed items are skipped with their archived result, changed terms for an existing id are refused, unconfirmed reads are rerun",
    errors: [
      { code: "batch_partial", when: "some items ok, some failed or refused", exit: EXIT.partial, retryable: false },
      { code: "batch_all_failed", when: "no item succeeded and at least one failed or was refused", exit: EXIT.all_failed, retryable: false },
      { code: "cancelled", when: "SIGINT: unread or not yet sent items are not_sent, in-flight items sent_unconfirmed", exit: EXIT.cancelled, retryable: false },
      { code: "output_closed", when: "stdout consumer went away (EPIPE): dispatch stops, state is persisted, summary goes to stderr", exit: EXIT.output_closed, retryable: false },
      { code: "batch_too_many_items", when: "input has more than --max-items items; items before the cap keep their records", exit: EXIT.input, retryable: false },
      { code: "batch_line_too_long", when: "an input line is longer than --max-line-bytes", exit: EXIT.input, retryable: false },
      { code: "item_terms_changed", when: "per item: the id exists in the state dir with different terms; refused, archive kept", exit: EXIT.conflict, retryable: false },
      { code: "batch_state_locked", when: "another live run holds the state dir", exit: EXIT.conflict, retryable: false },
    ] },
  { id: "result.show", argv: ["result", "show"], group: "readiness", summary: "Read a saved result record offline after a lost process or stdout.", effect: "none", auth: "none",
    flags: { file: { type: "string", required: true, description: "Absolute path written by readiness check --out." } }, output: RECORD_SCHEMA, retry: "not_applicable", recovery: "rerun" },
];

// Authoritative product schemas, referenced instead of restated. Paths are at
// samedaydesk@32437117 unless named otherwise.
const OPENAPI = "server/vendor/machine-gateway/openapi.json#/components/schemas";
const SCHEMA_REFS = {
  capabilities: [`${OPENAPI}/health`, `${OPENAPI}/discovery`, "vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz:src/catalog.mjs#machine.profile"],
  "gateway.routes": [`${OPENAPI}/discovery`],
  "gateway.schema": ["server/vendor/machine-gateway/openapi.json#/paths/~1v1~1routes~1{route}~1{kind}.schema.json"],
  "gateway.test": [`${OPENAPI}/test`],
  "gateway.quote": [`${OPENAPI}/quoteRequest`, `${OPENAPI}/quote`],
  "gateway.execute": [`${OPENAPI}/quoteRequest`, `${OPENAPI}/quote`, `${OPENAPI}/executeRequest`, `${OPENAPI}/receipt`, "server/vendor/machine-gateway/bin/caller.mjs#caller-state.v1"],
  "gateway.resume": [`${OPENAPI}/executeRequest`, `${OPENAPI}/receipt`, "server/vendor/machine-gateway/bin/caller.mjs#caller-state.v1"],
  "gateway.result": [`${OPENAPI}/receipt`],
  "market.profile": ["vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz:src/catalog.mjs#machine.profile"],
  "market.discover": ["vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz:src/catalog.mjs#machine.discover"],
  "readiness.check": ["server/lib/agent-readiness/schema.js#agent-readiness.report.v1"],
  "batch.run": [`${OPENAPI}/health`, `${OPENAPI}/discovery`, `${OPENAPI}/receipt`, "server/lib/agent-readiness/schema.js#agent-readiness.report.v1", "vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz:src/catalog.mjs#machine.profile", "vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz:src/catalog.mjs#machine.discover"],
};

// Recovery contract per command (plan runtime item 6). No class claims
// exactly-once execution or survival of lost local storage.
export const RECOVERY_CLASSES = Object.freeze({
  local_no_dispatch: "No network dispatch. Rerun.",
  safe_read_rerun: "GET with bounded backoff. Rerun; the read has no server effect.",
  local_record_readback: "Reads a record this CLI wrote earlier. If the record is lost, rerun the producing read.",
  idempotent_key_readback: "The state file (0600, caller-state v1) holds the quote, exact input and idempotency key before execution; a dispatch record (sent_unconfirmed) is saved before every POST. Recovery reads back by receipt id, or resends the identical request with the same key, which the gateway answers from its stored receipt. Never a new key for the same quote. A lost state file cannot be recovered by this CLI.",
  batch_persisted_items: "Per-item state (0600) says sent_unconfirmed before each dispatch. Completed items are archived once and skipped on rerun. Every batch op is a read, so an unconfirmed item is rerun; a non-read class in sent_unconfirmed would be refused (uncertain_mutation_not_replayed). It makes no single-execution promise; a lost state dir loses the skip list, not correctness of reads.",
  unresolved_post_no_key: "POST with no idempotency key, readback or server id. The server documents no effect for this route, but a failure after sending does not prove none occurred. Never retried automatically. Use --recovery-file to persist the attempt identity before sending.",
});
const RECOVERY_CLASS = {
  help: "local_no_dispatch", version: "local_no_dispatch", completion: "local_no_dispatch", commands: "local_no_dispatch", schema: "local_no_dispatch",
  capabilities: "safe_read_rerun", "gateway.routes": "safe_read_rerun", "gateway.schema": "safe_read_rerun", "market.profile": "safe_read_rerun",
  "market.discover": "safe_read_rerun", "readiness.check": "safe_read_rerun",
  "gateway.test": "unresolved_post_no_key", "gateway.quote": "unresolved_post_no_key",
  "result.show": "local_record_readback",
  "batch.run": "batch_persisted_items",
  "gateway.execute": "idempotent_key_readback", "gateway.resume": "idempotent_key_readback", "gateway.result": "safe_read_rerun",
};

export const COMMANDS = Object.freeze(BASE_COMMANDS.map(command => Object.freeze({
  ...command,
  recoveryClass: RECOVERY_CLASS[command.id],
  schemaRefs: SCHEMA_REFS[command.id] ?? [],
})));

// Runtime facts every command shares.
export const RUNTIME = Object.freeze({
  cancellation: Object.freeze({
    signal: "SIGINT",
    exit: 130,
    code: "cancelled",
    inFlight: "Aborted through AbortSignal when client-io accepts one (machine-gateway 0.1.3 client). With the pinned client-io the CLI stops waiting; the request may still complete remotely, so recovery is sent_unconfirmed.",
    remoteWork: "Not cancelled remotely by SIGINT.",
  }),
  timeout: Object.freeze({ code: "request_timeout", exit: 2, retry: "GET only, bounded" }),
  recoveryValues: Object.freeze(["not_sent", "sent_unconfirmed", "remote_refused", "remote_committed", "remote_cancelled"]),
  clientIo: Object.freeze([
    Object.freeze({ version: "pinned", source: "machine-gateway 0.1.2 bin/client-io.mjs (= samedaydesk@32437117e5232480b18349721069b2a8a0fc2a2c:server/vendor/machine-gateway/bin/client-io.mjs)", errors: "message only; CLI observes the refusal body and infers recovery" }),
    Object.freeze({ version: "repaired", source: "machine-gateway 0.1.3 bin/client-io.mjs (in-tree server/vendor/machine-gateway/bin/client-io.mjs, sha256 c6613e44349a5741308d551df41c85b55709f48ea1ce7cf72f229dc00939a8aa)", errors: "code, serverCode, status and recovery on the error; preferred when present" }),
  ]),
});

// Consume-only capability providers. Their output schema is referenced by
// package export and sha256, never copied. Not installed in this version.
export const PROVIDERS = Object.freeze([Object.freeze({
  id: "samedaydesk-capability-compat",
  version: "0.1.0",
  status: "not_installed",
  entry: "describeCapabilities",
  output: "samedaydesk.capability-provider.preview.v1",
  schemaRef: "samedaydesk-capability-compat/schema/preview.v1",
  schemaFile: "packs/samedaydesk-capability-compat/schema/capability-provider.preview.v1.schema.json",
  schemaSha256: "7ca5b23a84683ca24d2140d0dfa81a5de23ff583f247626c3f53a3b549d824e2",
  source: "epistemedeus/x402-url-extractor@967ec6a29a593b41e846b7b9004cbd5ad4c6b908",
  pin: "vendor/packs/PACKS.json",
})]);

// Thin task manifest: curated tasks mapped to component commands and their
// wire operation ids. Wire ids are preserved, not renamed.
export const TASKS = Object.freeze([
  { id: "task.find_capability", summary: "Find a useful current capability and its health.", steps: ["capabilities", "gateway.routes"], providerRefs: ["samedaydesk-capability-compat"] },
  { id: "task.inspect_inputs_and_cost", summary: "Read exact inputs and outputs, then a remote anonymous quote.", steps: ["gateway.schema", "gateway.quote"] },
  { id: "task.free_readiness", summary: "Run the free readiness check and save a recoverable record.", steps: ["readiness.check"] },
  { id: "task.recover_result", summary: "Recover a saved result offline after a lost process or stdout.", steps: ["result.show"] },
  { id: "task.browse_market", summary: "Read the public market profile and listings.", steps: ["market.profile", "market.discover"] },
  { id: "task.tenant_execute", summary: "Configured tenant: inspect inputs, server quote, execute a free route, verified result.", steps: ["gateway.schema", "gateway.quote", "gateway.execute", "gateway.result"] },
  { id: "task.tenant_recover", summary: "Recover a tenant execution after a lost response or process from its state file.", steps: ["gateway.resume", "gateway.result"] },
  { id: "task.batch_reads", summary: "Run many supported reads with persisted per-item recovery.", steps: ["batch.run"] },
].map(task => Object.freeze({
  ...task,
  wire: task.steps.map(id => {
    const command = BASE_COMMANDS.find(entry => entry.id === id);
    return { command: id, operations: (command.http ?? []).map(item => item.operationId) };
  }),
})));


export function commandById(id) {
  return COMMANDS.find(command => command.id === id) ?? null;
}

export function commandByArgv(positionals) {
  return COMMANDS.find(command => command.argv.length <= positionals.length
    && command.argv.every((part, index) => part === positionals[index])
    && (positionals.length === command.argv.length || (command.positional && positionals.length === command.argv.length + 1))) ?? null;
}

export function manifest(version, group) {
  return {
    schema: MANIFEST_SCHEMA,
    cliVersion: version,
    envelopes: { result: RESULT_SCHEMA, error: ERROR_SCHEMA, stream: STREAM_SCHEMA },
    credentialSources: CREDENTIAL_SOURCES.map(source => ({ ...source, scope: CREDENTIAL_SCOPE, boundTo: "the run's --origin and the gateway mount path", printed: false, argv: false, environment: false })),
    exitCodes: EXIT,
    groups: GROUPS,
    recoveryClasses: RECOVERY_CLASSES,
    runtime: RUNTIME,
    providers: PROVIDERS,
    tasks: TASKS,
    commands: group ? COMMANDS.filter(command => command.group === group) : COMMANDS,
  };
}
