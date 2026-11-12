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

const ORIGIN_FLAGS = {
  origin: { type: "string", required: false, description: "https origin. Default https://samedaydesk.com." },
  "allow-loopback": { type: "boolean", required: false, description: "Permit http://127.0.0.1 or http://[::1] for local tests." },
  "dry-run": { type: "boolean", required: false, description: "Return the validated request, effect and required authority without sending." },
};
const RECOVERY_FLAG = {
  "recovery-file": { type: "string", required: false, description: "Absolute path for a new 0600 recovery record written before the POST is sent. If it cannot be written, nothing is sent." },
};
const ROUTE_ID = { type: "string", required: true, pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$", description: "Gateway route id from gateway routes." };

export const GROUPS = Object.freeze([
  { id: "discovery", summary: "Read this CLI's own command contract. Local, no network." },
  { id: "capabilities", summary: "Read current hosted capability, health and cost facts." },
  { id: "gateway", summary: "Machine-gateway routes: schemas, labeled fixture and anonymous quote preview." },
  { id: "market", summary: "Public machine-market profile and listing reads." },
  { id: "readiness", summary: "Free agent-readiness check with a saved, recoverable result." },
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
  { id: "gateway.quote", argv: ["gateway", "quote"], group: "gateway", summary: "Remote anonymous quote from the gateway for exact input (sent to the server; not a local preview, not a reservation). Never executable; execution needs an operator-enrolled tenant bearer.", effect: "remote_quote", auth: "none",
    flags: { route: ROUTE_ID, "input-file": { type: "string", required: true, description: "JSON input file, or - for stdin. At most 131072 bytes." }, ...RECOVERY_FLAG, ...ORIGIN_FLAGS },
    http: [{ method: "POST", path: `${GATEWAY_PATH}/v1/quote`, operationId: "quoteRoute" }], output: "neomorphic.machine-gateway.quote", retry: "none", recovery: "rerun; anonymous quotes cannot execute",
    requiredAuthorityForNextStep: { execute: "tenantBearer (operator-enrolled; not self-serve)" } },
  { id: "market.profile", argv: ["market", "profile"], group: "market", summary: "Public machine-market source and capability fields.", effect: "read", auth: "none", flags: { ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${MARKET_PATH}/v1/market/profile`, operationId: "machine.profile" }], output: "c0-1 profile value", retry: "bounded_get", recovery: "rerun" },
  { id: "market.discover", argv: ["market", "discover"], group: "market", summary: "Public listings. --stream emits JSONL pages with a terminal record.", effect: "read", auth: "none",
    flags: { limit: { type: "integer", required: false, minimum: 1, maximum: 20, description: "Page size. Default 20." }, cursor: { type: "string", required: false, maxLength: 512, description: "Opaque cursor from nextCursor." }, "max-pages": { type: "integer", required: false, minimum: 1, maximum: 10, description: "With --stream. Default 3." }, stream: { type: "boolean", required: false, description: "JSONL output." }, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${MARKET_PATH}/v1/market/discover?limit={limit}&cursor={cursor}`, operationId: "machine.discover" }], output: "c0-1 discover value", retry: "bounded_get", recovery: "resume with --cursor nextCursor; on cursor_refused (exit 1) restart without --cursor",
    errors: [{ code: "cursor_refused", when: "server answered with code cursor_refused (HTTP 400); evidence.server keeps the original code and body", exit: 1, retryable: false, nextAction: "market discover (restart without --cursor)" }] },
  { id: "readiness.check", argv: ["readiness", "check"], group: "readiness", summary: "Free agent-readiness report for a public host. Same operation as MCP check_agent_readiness.", effect: "read", auth: "none",
    flags: { host: { type: "string", required: true, pattern: "^(?=.{1,253}$)[a-z0-9-]+(\\.[a-z0-9-]+)+$", description: "Public host, for example example.com." }, out: { type: "string", required: false, description: "Absolute path for a new 0600 result record." }, discovery: { type: "string", required: false, enum: ["mcp", "a2a", "llms-txt", "skill-md", "openapi", "registry", "search", "referral", "operator"], description: "Caller-declared acquisition label. Recorded as declared, never observed." }, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: "/agent-readiness?host={host}&format=json", operationId: "check_agent_readiness" }], output: "agent-readiness.report.v1", retry: "bounded_get", recovery: "result show --file OUT, or rerun the GET" },
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
  "market.profile": ["vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz:src/catalog.mjs#machine.profile"],
  "market.discover": ["vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz:src/catalog.mjs#machine.discover"],
  "readiness.check": ["server/lib/agent-readiness/schema.js#agent-readiness.report.v1"],
};

// Recovery contract per command (plan runtime item 6). No class claims
// exactly-once execution or survival of lost local storage.
export const RECOVERY_CLASSES = Object.freeze({
  local_no_dispatch: "No network dispatch. Rerun.",
  safe_read_rerun: "GET with bounded backoff. Rerun; the read has no server effect.",
  local_record_readback: "Reads a record this CLI wrote earlier. If the record is lost, rerun the producing read.",
  unresolved_post_no_key: "POST with no idempotency key, readback or server id. The server documents no effect for this route, but a failure after sending does not prove none occurred. Never retried automatically. Use --recovery-file to persist the attempt identity before sending.",
});
const RECOVERY_CLASS = {
  help: "local_no_dispatch", version: "local_no_dispatch", completion: "local_no_dispatch", commands: "local_no_dispatch", schema: "local_no_dispatch",
  capabilities: "safe_read_rerun", "gateway.routes": "safe_read_rerun", "gateway.schema": "safe_read_rerun", "market.profile": "safe_read_rerun",
  "market.discover": "safe_read_rerun", "readiness.check": "safe_read_rerun",
  "gateway.test": "unresolved_post_no_key", "gateway.quote": "unresolved_post_no_key",
  "result.show": "local_record_readback",
};

export const COMMANDS = Object.freeze(BASE_COMMANDS.map(command => Object.freeze({
  ...command,
  recoveryClass: RECOVERY_CLASS[command.id],
  schemaRefs: SCHEMA_REFS[command.id] ?? [],
})));

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
    credentialSources: ["none in this version"],
    groups: GROUPS,
    recoveryClasses: RECOVERY_CLASSES,
    providers: PROVIDERS,
    tasks: TASKS,
    commands: group ? COMMANDS.filter(command => command.group === group) : COMMANDS,
  };
}
