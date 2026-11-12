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
const ROUTE_ID = { type: "string", required: true, pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$", description: "Gateway route id from gateway routes." };

export const GROUPS = Object.freeze([
  { id: "discovery", summary: "Read this CLI's own command contract. Local, no network." },
  { id: "capabilities", summary: "Read current hosted capability, health and cost facts." },
  { id: "gateway", summary: "Machine-gateway routes: schemas, labeled fixture and anonymous quote preview." },
  { id: "market", summary: "Public machine-market profile and listing reads." },
  { id: "readiness", summary: "Free agent-readiness check with a saved, recoverable result." },
]);

export const COMMANDS = Object.freeze([
  { id: "help", argv: ["help"], group: "discovery", summary: "List groups and command ids.", effect: "none", auth: "none", flags: {}, output: "samedaydesk.cli.help.v1", retry: "not_applicable", recovery: "rerun" },
  { id: "version", argv: ["version"], group: "discovery", summary: "Package and manifest version.", effect: "none", auth: "none", flags: {}, output: "samedaydesk.cli.version.v1", retry: "not_applicable", recovery: "rerun" },
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
    flags: { route: ROUTE_ID, ...ORIGIN_FLAGS },
    http: [{ method: "POST", path: `${GATEWAY_PATH}/v1/test`, operationId: "testRouteFixture" }], output: "neomorphic.machine-gateway.test", retry: "none", recovery: "rerun; the server documents no effect" },
  { id: "gateway.quote", argv: ["gateway", "quote"], group: "gateway", summary: "Anonymous quote preview for exact input. Never executable; execution needs an operator-enrolled tenant bearer.", effect: "preview", auth: "none",
    flags: { route: ROUTE_ID, "input-file": { type: "string", required: true, description: "JSON input file, or - for stdin. At most 131072 bytes." }, ...ORIGIN_FLAGS },
    http: [{ method: "POST", path: `${GATEWAY_PATH}/v1/quote`, operationId: "quoteRoute" }], output: "neomorphic.machine-gateway.quote", retry: "none", recovery: "rerun; anonymous quotes cannot execute",
    requiredAuthorityForNextStep: { execute: "tenantBearer (operator-enrolled; not self-serve)" } },
  { id: "market.profile", argv: ["market", "profile"], group: "market", summary: "Public machine-market source and capability fields.", effect: "read", auth: "none", flags: { ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${MARKET_PATH}/v1/market/profile`, operationId: "machine.profile" }], output: "c0-1 profile value", retry: "bounded_get", recovery: "rerun" },
  { id: "market.discover", argv: ["market", "discover"], group: "market", summary: "Public listings. --stream emits JSONL pages with a terminal record.", effect: "read", auth: "none",
    flags: { limit: { type: "integer", required: false, minimum: 1, maximum: 20, description: "Page size. Default 20." }, cursor: { type: "string", required: false, maxLength: 512, description: "Opaque cursor from nextCursor." }, "max-pages": { type: "integer", required: false, minimum: 1, maximum: 10, description: "With --stream. Default 3." }, stream: { type: "boolean", required: false, description: "JSONL output." }, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: `${MARKET_PATH}/v1/market/discover?limit={limit}&cursor={cursor}`, operationId: "machine.discover" }], output: "c0-1 discover value", retry: "bounded_get", recovery: "resume with --cursor nextCursor; on cursor_refused (exit 1) restart without --cursor",
    errors: [{ code: "cursor_refused", when: "HTTP 400 on a request that carried a cursor", exit: 1, retryable: false, nextAction: "market discover (restart without --cursor)" }] },
  { id: "readiness.check", argv: ["readiness", "check"], group: "readiness", summary: "Free agent-readiness report for a public host. Same operation as MCP check_agent_readiness.", effect: "read", auth: "none",
    flags: { host: { type: "string", required: true, pattern: "^(?=.{1,253}$)[a-z0-9-]+(\\.[a-z0-9-]+)+$", description: "Public host, for example example.com." }, out: { type: "string", required: false, description: "Absolute path for a new 0600 result record." }, discovery: { type: "string", required: false, enum: ["mcp", "a2a", "llms-txt", "skill-md", "openapi", "registry", "search", "referral", "operator"], description: "Caller-declared acquisition label. Recorded as declared, never observed." }, ...ORIGIN_FLAGS },
    http: [{ method: "GET", path: "/agent-readiness?host={host}&format=json", operationId: "check_agent_readiness" }], output: "agent-readiness.report.v1", retry: "bounded_get", recovery: "result show --file OUT, or rerun the GET" },
  { id: "result.show", argv: ["result", "show"], group: "readiness", summary: "Read a saved result record offline after a lost process or stdout.", effect: "none", auth: "none",
    flags: { file: { type: "string", required: true, description: "Absolute path written by readiness check --out." } }, output: RECORD_SCHEMA, retry: "not_applicable", recovery: "rerun" },
]);

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
    commands: group ? COMMANDS.filter(command => command.group === group) : COMMANDS,
  };
}
