// Apex machine declarations. Generated from the mounted MCP inventory and the
// HTTP routes this process actually serves. Paid gateway documents stay on
// agents.samedaydesk.com; this module only links the live canonical URLs.
import { APEX_ORIGIN } from "./apex-agent-card.js";
import { DECLARATION_FETCH_PATHS } from "./declaration-paths.js";
import {
  AGENT_READINESS_RATE_LIMIT_DEFAULT,
  AGENT_READINESS_RATE_WINDOW_MS_DEFAULT,
} from "./agent-readiness/rate-limit.js";
import { publicDeploymentBody } from "./public-readiness-mount.js";
import { buildTaskMarketDelegationPlan } from "./taskmarket.js";
import { SERVER_INFO, SUPPORTED_PROTOCOL_VERSIONS, TOOLS } from "../routes/mcp.js";
import { MCP_BATCH_MIN, MCP_BATCH_MAX, MCP_BATCH_PROTOCOL_VERSIONS, MCP_BODY_LIMIT, rpcMessageSchema, rpcIdSchema, rpcBatchSchema } from "./mcp-admission.js";

export const PAID_ORIGIN = "https://agents.samedaydesk.com";

// Live canonical paid documents observed with anonymous GET on 2026-10-04.
// /.well-known/api-catalog on that host was HTTP 404 and is not linked.
// Do not copy route counts, prices, or payment addresses from those bodies.
export const PAID_GATEWAY_LINKS = Object.freeze([
  { rel: "service-desc", href: `${PAID_ORIGIN}/openapi.json`, type: "application/json", title: "Paid gateway OpenAPI" },
  { rel: "service-desc", href: `${PAID_ORIGIN}/.well-known/x402`, type: "application/json", title: "Paid gateway x402 manifest" },
  { rel: "service-doc", href: `${PAID_ORIGIN}/llms.txt`, type: "text/plain", title: "Paid gateway llms.txt" },
  { rel: "service-meta", href: `${PAID_ORIGIN}/.well-known/agent-card.json`, type: "application/json", title: "Paid gateway agent card" },
  { rel: "status", href: `${PAID_ORIGIN}/mcp`, type: "application/json", title: "Paid gateway MCP" },
  { rel: "status", href: `${PAID_ORIGIN}/healthz`, type: "application/json", title: "Paid gateway health" },
  { rel: "service-desc", href: `${PAID_ORIGIN}/api/actions`, type: "application/json", title: "Paid gateway action catalog" },
]);

const REGISTERED_LINK_RELS = new Set(["service-desc", "service-doc", "service-meta", "status", "describedby"]);

const TOOL_AUTHORITY = Object.freeze({
  check_ai_readiness: {
    tier: "free",
    executesPayment: false,
    network: "public-url",
    http: "GET /api/tools/ai-readiness?url=",
  },
  check_agent_readiness: {
    tier: "free",
    executesPayment: false,
    network: "public-host",
    http: "GET /agent-readiness?host=&format=json",
    rateLimit: `${AGENT_READINESS_RATE_LIMIT_DEFAULT} per ${AGENT_READINESS_RATE_WINDOW_MS_DEFAULT}ms per client key`,
  },
  generate_complete_fix_pack: {
    tier: "paid-license",
    executesPayment: false,
    network: "public-url",
    note: "Accepts an existing Stripe checkout-session license. This apex call does not create a charge.",
  },
  plan_taskmarket_delegation: {
    tier: "free",
    executesPayment: false,
    network: "none",
    note: "Returns an approval plan. request.executed and official_cli.executed stay false.",
  },
  browse_taskmarket_tasks: {
    tier: "free",
    executesPayment: false,
    network: "taskmarket-read",
  },
  track_taskmarket_task: {
    tier: "free",
    executesPayment: false,
    network: "taskmarket-read",
  },
  project_funnel_evidence: {
    tier: "free",
    executesPayment: false,
    network: "none",
    http: "POST /api/funnel-evidence",
    note: "Projects a caller-supplied packet. This call does not fetch, store, or spend.",
  },
});

const PLAN_ARGUMENTS = Object.freeze({
  request: "Compare the public status pages and list sections that changed",
  deliverable: "A markdown list of changed sections with URLs",
  acceptance_criteria: ["Each item names the section and the URL"],
  reward_usdc: "2",
  max_spend_usdc: "2",
  deadline_hours: 24,
  mode: "bounty",
  tags: ["status-page"],
});

const PLAN_EXAMPLE_NOW = new Date("2026-10-04T00:00:00.000Z");

export function planToolArguments() {
  return structuredClone(PLAN_ARGUMENTS);
}

export function planToolResult(args = PLAN_ARGUMENTS, now = PLAN_EXAMPLE_NOW) {
  return buildTaskMarketDelegationPlan(args, now);
}

function jsonRpc(id, method, params) {
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

function planCallBody(args = PLAN_ARGUMENTS, id = "plan-1") {
  return jsonRpc(id, "tools/call", { name: "plan_taskmarket_delegation", arguments: args });
}

export function mcpToolDeclarations(tools = TOOLS) {
  return tools.map((tool) => {
    const authority = TOOL_AUTHORITY[tool.name];
    if (!authority) throw new Error(`No apex authority for MCP tool ${tool.name}`);
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      annotations: tool.annotations,
      authority,
    };
  });
}

function errorContent(example) {
  return {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorObject" },
      example,
    },
  };
}

function readinessErrorContent(example) {
  return {
    ...errorContent(example),
    "text/html": { schema: { type: "string" }, example: "<!doctype html><html><body>Could not score that host</body></html>" },
  };
}

function jsonContent(schema, example) {
  return {
    "application/json": { schema, example },
  };
}

function operation({ operationId, summary, description, parameters, requestBody, responses, idempotent }) {
  return {
    operationId,
    summary,
    description,
    security: [],
    ...(idempotent === undefined ? {} : { "x-idempotent": idempotent }),
    ...(parameters ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
  };
}

const queryParam = (name, schema, description, required = false) => ({
  name,
  in: "query",
  required,
  description,
  schema,
});

function apexPaths(catalog, skillMarkdown) {
  const planResult = planToolResult();
  const rate = `Defaults to ${AGENT_READINESS_RATE_LIMIT_DEFAULT} calls per ${AGENT_READINESS_RATE_WINDOW_MS_DEFAULT / 1000} seconds per client key (AGENT_READINESS_RATE_LIMIT, AGENT_READINESS_RATE_WINDOW_MS). Client keys use the normalized socket peer by default. AGENT_READINESS_TRUSTED_PROXIES may explicitly list literal proxy IPs/CIDRs; a validated forwarded chain stops at the nearest untrusted hop. Invalid policy or addresses fall back to the peer.`;
  return {
    "/api/health": {
      get: operation({
        operationId: "getHealth",
        summary: "Process health and which optional providers are configured",
        description: "Anonymous liveness. configured booleans report this process only. They do not mean a hosted consumer is enrolled. No credentials.",
        responses: {
          "200": {
            description: "Process is answering.",
            content: jsonContent(
              {
                type: "object",
                required: ["ok", "service", "time", "configured"],
                properties: {
                  ok: { type: "boolean" },
                  service: { const: "samedaydesk" },
                  time: { type: "string" },
                  configured: {
                    type: "object",
                    required: ["supabase", "stripe", "email"],
                    properties: {
                      supabase: { type: "boolean" },
                      stripe: { type: "boolean" },
                      email: { type: "boolean" },
                    },
                  },
                },
              },
              { ok: true, service: "samedaydesk", time: "2026-10-04T00:00:00.000Z", configured: { supabase: false, stripe: false, email: false } },
            ),
          },
        },
      }),
    },
    "/api/funnel-evidence": {
      post: operation({
        operationId: "project_funnel_evidence",
        summary: "Project one declared funnel observation packet",
        description: "Free bounded projection of a caller-supplied packet. Retries are idempotent because nothing is stored. This is not a paginated collection. The call does not fetch input URLs, query customers, or spend.",
        idempotent: true,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "A neomorphic.funnel-decision-request.v1 packet or a neomorphic.live-measurement-input.v1 packet. URLs inside it are not fetched.",
              },
              example: {
                schema: "neomorphic.funnel-decision-request.v1",
                asOf: "2026-10-10T03:42:00.000Z",
                sources: [],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Typed projection and next action. Not a paginated collection.",
            content: jsonContent(
              {
                type: "object",
                required: ["schema", "evidenceAuthority", "inputFetched", "projection", "nextAction"],
                properties: {
                  schema: { const: "samedaydesk.funnel-evidence.v1" },
                  evidenceAuthority: { const: "caller-declared" },
                  inputFetched: { const: false },
                  hostedAcquisitionVerified: { const: false },
                  recognizedIncomeAtomic: { type: "null" },
                  independentCustomers: { type: "null" },
                  projection: { type: "object" },
                  nextAction: {
                    type: "object",
                    required: ["action", "changes"],
                    properties: {
                      action: { type: "string" },
                      changes: { type: "string" },
                    },
                  },
                },
              },
              {
                schema: "samedaydesk.funnel-evidence.v1",
                evidenceAuthority: "caller-declared",
                inputFetched: false,
                hostedAcquisitionVerified: false,
                recognizedIncomeAtomic: null,
                independentCustomers: null,
                projection: {
                  schema: "neomorphic.funnel-decision.v1",
                  decision: { kind: "measure", reasons: ["a_decision_changing_join_is_missing"] },
                },
                nextAction: {
                  action: "One source-separated discovery, signup, task, delivery, or payment export with explicit task, operation, or stored-event refs and a stated coverage.",
                  changes: "Which stage is observed. Provider observations are optional.",
                },
              },
            ),
          },
          "400": {
            description: "The packet was rejected.",
            content: errorContent({ error: { code: "request_schema" } }),
          },
          "413": {
            description: "The body is over the byte bound.",
            content: errorContent({ error: { code: "oversize" } }),
          },
        },
      }),
    },
    "/api/tools/ai-readiness": {
      get: operation({
        operationId: "check_ai_readiness",
        summary: "Free AI-readiness score for one public website",
        description: "Same check as the MCP tool check_ai_readiness. Fetches the public page, robots.txt, sitemap, and llms.txt. Private, loopback, and link-local hosts are refused with HTTP 400 before a fetch. The checks list is bounded to the fixed checker and is not paginated. No account.",
        parameters: [queryParam("url", { type: "string" }, "Public http(s) website, for example https://example.com", true)],
        responses: {
          "200": {
            description: "Score, grade, and one row per fixed check.",
            content: jsonContent(
              {
                type: "object",
                required: ["url", "score", "grade", "checks"],
                properties: {
                  url: { type: "string" },
                  score: { type: "integer" },
                  grade: { type: "string" },
                  checks: { type: "array", items: { type: "object" } },
                },
              },
              {
                url: "https://example.com/",
                score: 0,
                grade: "F",
                checks: [{ id: "crawlers", label: "AI crawlers", status: "fail", detail: "Illustrative row. Run the call for a live score." }],
                checkedAt: "2026-10-04T00:00:00.000Z",
              },
            ),
          },
          "400": { description: "Missing URL, non-public host, or a host that does not resolve to a public address.", content: errorContent({ error: "That address isn't reachable for a public check" }) },
          "502": { description: "The public site could not be read.", content: errorContent({ error: "Could not check that site" }) },
        },
      }),
    },
    "/api/tools/llms-txt": {
      get: operation({
        operationId: "generate_llms_txt",
        summary: "Free llms.txt draft from one public site",
        description: "Builds a llms.txt draft from the public sitemap or homepage links. The same SSRF guard as the AI-readiness check refuses private hosts. The page list is capped at 50 and is not paginated. This does not publish the draft.",
        parameters: [queryParam("url", { type: "string" }, "Public http(s) website", true)],
        responses: {
          "200": {
            description: "Draft text plus the page count.",
            content: jsonContent(
              {
                type: "object",
                required: ["origin", "siteName", "count", "llmsTxt"],
                properties: {
                  origin: { type: "string" },
                  siteName: { type: "string" },
                  count: { type: "integer" },
                  llmsTxt: { type: "string" },
                },
              },
              { origin: "https://example.com", siteName: "Example", count: 1, llmsTxt: "# Example\n\n## Pages\n\n- [Home](https://example.com/)\n" },
            ),
          },
          "400": { description: "The URL is missing or not a public host.", content: errorContent({ error: "That host isn't a public website" }) },
          "502": { description: "The public site could not be read.", content: errorContent({ error: "Could not generate llms.txt" }) },
        },
      }),
    },
    "/agent-readiness": {
      get: operation({
        operationId: "check_agent_readiness",
        summary: "Free agent-readiness score or the HTML form",
        description: `Without format=json this returns HTML for a person. With format=json and a public host it returns the score payload. format=fix-pack returns markdown. ${rate} A missing host with format=json is HTTP 400, not a signup wall. The checks array is bounded to the fixed checker and is not paginated. The probe never calls a real tool on the target.`,
        parameters: [
          queryParam("host", { type: "string" }, "Public host, for example example.com"),
          queryParam("format", { type: "string", enum: ["json", "fix-pack"] }, "json or fix-pack. Omit for HTML."),
        ],
        responses: {
          "200": {
            description: "JSON score when format=json. HTML when format is omitted.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["host", "score", "checks"],
                  properties: {
                    host: { type: "string" },
                    score: { type: "number" },
                    checks: { type: "array", items: { type: "object" } },
                    topFixes: { type: "array", items: { type: "object" } },
                  },
                },
                example: { host: "example.com", score: 0, free: true, checks: [], topFixes: [] },
              },
              "text/html": { schema: { type: "string" }, example: "<!doctype html><html><body>Agent readiness checker</body></html>" },
              "text/markdown": { schema: { type: "string" }, example: "# Agent readiness fix pack\n\nHost: example.com\n" },
            },
          },
          "400": { description: "format=json or format=fix-pack without a host, or a host the checker rejects. Other formats return HTML errors.", content: readinessErrorContent({ error: "Provide a host, for example example.com" }) },
          "429": {
            description: "Client key exceeded the agent-readiness rate limit. Retry-After is set.",
            headers: { "Retry-After": { schema: { type: "string" } } },
            content: readinessErrorContent({ error: "Too many checks from this client. Retry in 1s." }),
          },
          "502": { description: "The host could not be probed.", content: readinessErrorContent({ error: "Could not probe that host" }) },
        },
      }),
    },
    "/mcp": {
      get: operation({
        operationId: "describeMcpEndpoint",
        summary: "Plain-text description of the apex MCP server",
        description: "Anonymous setup text. A cs query shows a buyer their already-issued license code and is not a machine tool call. Protocol calls use POST.",
        responses: {
          "200": {
            description: "Endpoint instructions.",
            content: {
              "text/plain": {
                schema: { type: "string" },
                example: "samedaydesk agent tools MCP server (Streamable HTTP).\n",
              },
            },
          },
        },
      }),
      post: operation({
        operationId: "mcpJsonRpc",
        summary: "MCP JSON-RPC for the apex tool inventory",
        description: `Streamable HTTP body. Supported MCP-Protocol-Version values: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}. initialize negotiates the body protocolVersion and echoes a supported one, otherwise ${SUPPORTED_PROTOCOL_VERSIONS[0]}. Only a valid singleton initialize is exempt from the unsupported-header HTTP 400 gate. A missing header stays accepted using the inherited March-2025 compatibility path. Headers 2025-06-18 and 2025-11-25 require one message per POST. Compatibility batches of ${MCP_BATCH_MIN}..${MCP_BATCH_MAX} entries are accepted without a header or with ${MCP_BATCH_PROTOCOL_VERSIONS.join(" or ")}; the 2024 path is an SDS extension, not deprecated HTTP+SSE. Valid calls in mixed compatibility batches execute even if another entry is invalid. Requests use string/integer IDs; notifications omit ID and never receive results, including unknown methods and tool errors. Accepted responses are no-ops with HTTP 202. Invalid envelopes return -32600, invalid parameters -32602, unknown methods -32601, and malformed JSON -32700. Supplied tool argument types are checked before execution; missing tool fields retain useful isError results. tools/list returns one bounded tool array for this server, not a paginated collection. Repeating a read or plan_taskmarket_delegation is not a purchase: that plan keeps request.executed false and does not accept an Idempotency-Key because it does not create or fund a task. generate_complete_fix_pack does not charge; it only accepts an existing license. Unknown tool names return JSON-RPC error -32602.`,
        idempotent: false,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { anyOf: [
                { $ref: "#/components/schemas/JsonRpcRequest" },
                rpcBatchSchema({ anyOf: [{ $ref: "#/components/schemas/JsonRpcRequest" }, { $ref: "#/components/schemas/JsonRpcClientResponse" }] }),
                { $ref: "#/components/schemas/JsonRpcClientResponse" },
              ] },
              example: planCallBody(),
            },
          },
        },
        responses: {
          "200": {
            description: "JSON-RPC result, or a JSON-RPC error object for an unknown tool or a bad request body that still parsed.",
            content: jsonContent(
              { anyOf: [
                { $ref: "#/components/schemas/JsonRpcSuccess" },
                { $ref: "#/components/schemas/JsonRpcError" },
                rpcBatchSchema({ anyOf: [
                  { $ref: "#/components/schemas/JsonRpcSuccess" },
                  { $ref: "#/components/schemas/JsonRpcError" },
                ] }),
              ] },
              { jsonrpc: "2.0", id: "plan-1", result: { content: [{ type: "text", text: "TaskMarket plan" }], structuredContent: planResult } },
            ),
          },
          "202": { description: "Accepted notifications or responses only; no body." },
          "400": {
            description: "Unsupported protocol header (-32000), invalid envelope or rejected compatibility batch (-32600), or malformed JSON (-32700). No tool executes for these transport failures.",
            content: {
              ...jsonContent(
                { $ref: "#/components/schemas/JsonRpcError" },
                { jsonrpc: "2.0", id: null, error: { code: -32000, message: `Bad Request: Unsupported protocol version: 1999-01-01 (supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")})` } },
              ),
            },
          },
          "413": { description: `MCP parser rejects a body larger than ${MCP_BODY_LIMIT} before execution.`, content: jsonContent({ $ref: "#/components/schemas/JsonRpcError" }, { jsonrpc: "2.0", id: null, error: { code: -32000, message: `Request body exceeds ${MCP_BODY_LIMIT}` } }) },
          "415": { description: "Unsupported JSON charset or content encoding.", content: jsonContent({ $ref: "#/components/schemas/JsonRpcError" }, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Invalid request body" } }) },
        },
      }),
    },
    "/.well-known/agent-card.json": {
      get: operation({
        operationId: "getAgentCard",
        summary: "Apex A2A card generated from the MCP tool inventory",
        description: "Skill ids are the apex MCP tool names. The skills array is the bounded MCP inventory, not a paginated collection. The description points at the paid gateway card and does not copy it.",
        responses: {
          "200": {
            description: "Agent card JSON.",
            content: jsonContent(
              { type: "object", required: ["name", "skills", "interfaces"], properties: { name: { type: "string" }, skills: { type: "array", items: { type: "object" } }, interfaces: { type: "array", items: { type: "object" } } } },
              { name: "SameDayDesk", skills: [{ id: "check_ai_readiness" }], interfaces: [{ transport: "MCP", url: `${APEX_ORIGIN}/mcp` }] },
            ),
          },
        },
      }),
    },
    "/.well-known/mcp-registry-auth": {
      get: operation({
        operationId: "getMcpRegistryAuth",
        summary: "Domain proof for the MCP registry namespace",
        description: "Plain-text registry challenge. Not a tool and not a paid manifest.",
        responses: {
          "200": {
            description: "Registry auth line.",
            content: { "text/plain": { schema: { type: "string" }, example: "v=MCPv1; k=ed25519; p=j1v9MjBVY0nqrVTwoNqXomOhEAisPObP5Fnq+J7Zc88=" } },
          },
        },
      }),
    },
    "/openapi.json": {
      get: operation({
        operationId: "getOpenApi",
        summary: "This OpenAPI document",
        description: "Returns the JSON document you are reading, with content type application/openapi+json. GET and HEAD share headers. OPTIONS is a CORS preflight.",
        responses: {
          "200": {
            description: "OpenAPI 3.1 document.",
            content: { "application/openapi+json": { schema: { type: "object", required: ["openapi", "info", "paths"] }, example: { openapi: "3.1.0", info: { title: "SameDayDesk apex", version: SERVER_INFO.version }, paths: {} } } },
          },
        },
      }),
    },
    "/skill.md": {
      get: operation({
        operationId: "getSkillMarkdown",
        summary: "Markdown instructions for the apex MCP tools",
        description: "Generated from the mounted tool names, input schemas, and protocol versions. Content type text/markdown.",
        responses: {
          "200": {
            description: "Skill markdown.",
            content: { "text/markdown": { schema: { type: "string" }, example: skillMarkdown.slice(0, 240) } },
          },
        },
      }),
    },
    "/.well-known/api-catalog": {
      get: operation({
        operationId: "getApiCatalog",
        summary: "RFC 9727 linkset for apex and paid-gateway documents",
        description: "Content type application/linkset+json. The linkset is a bounded pair of anchors, not a paginated collection. Apex links are same-origin. Paid links use absolute URLs on the paid host and are not proxied.",
        responses: {
          "200": {
            description: "Linkset.",
            content: {
              "application/linkset+json": {
                schema: { type: "object", required: ["linkset"], properties: { linkset: { type: "array", items: { type: "object" } } } },
                example: catalog,
              },
            },
          },
        },
      }),
    },
    "/api/correspondence/healthz": {
      get: operation({
        operationId: "getCorrespondenceHealth",
        summary: "Correspondence mount health, disabled unless configured",
        description: "Always mounted. Without CORRESPONDENCE_DATABASE_URL and CORRESPONDENCE_ADMIN_TOKEN the body is enabled false. That response is not a working mailbox. Other correspondence routes then answer 503.",
        responses: {
          "200": {
            description: "Enabled flag for this process.",
            content: jsonContent(
              { type: "object", required: ["ok", "enabled"], properties: { ok: { type: "boolean" }, enabled: { type: "boolean" }, reason: { type: "string" } } },
              { ok: false, enabled: false, reason: "unconfigured" },
            ),
          },
        },
      }),
    },
    "/api/hosted-useful/healthz": {
      get: operation({
        operationId: "getHostedUsefulHealth",
        summary: "Hosted useful-journey health, not a hosted consumer",
        description: "The route source is mounted. productionReady and publicationVerified stay false until a separate enrollment. Do not call job admission from this document. An unconfigured process returns the example body.",
        responses: {
          "200": {
            description: "Enrollment flag. enabled true is still not productionReady.",
            content: jsonContent(
              {
                type: "object",
                required: ["enabled", "publicationVerified", "productionReady"],
                properties: {
                  enabled: { type: "boolean" },
                  store: {},
                  reason: { type: ["string", "null"] },
                  publicEvaluation: { type: "boolean" },
                  publicationVerified: { const: false },
                  productionReady: { const: false },
                },
              },
              { enabled: false, store: null, reason: "unconfigured", publicEvaluation: true, publicationVerified: false, productionReady: false },
            ),
          },
        },
      }),
    },
    "/api/public-readiness/healthz": {
      get: operation({
        operationId: "getPublicReadinessHealth",
        summary: "Vendored checker health inside this process",
        description: "Reports whether the vendored checker loaded. publicDeployment.activated stays false. This is not a public-host deployment and not a hosted consumer.",
        responses: {
          "200": {
            description: "Checker availability. publicDeployment is the source helper's body.",
            content: jsonContent(
              {
                type: "object",
                required: ["publicDeployment"],
                properties: {
                  ok: { type: "boolean" },
                  enabled: { type: "boolean" },
                  publicDeployment: {
                    type: "object",
                    required: ["activated"],
                    properties: { activated: { const: false }, readback: {}, reason: { type: "string" } },
                  },
                },
              },
              { ok: false, enabled: false, reason: "checker_unavailable", publicDeployment: publicDeploymentBody() },
            ),
          },
        },
      }),
    },
  };
}

export function apexApiCatalog() {
  const apexLinks = [
    { rel: "service-desc", href: `${APEX_ORIGIN}/openapi.json`, type: "application/openapi+json", title: "Apex OpenAPI" },
    { rel: "service-doc", href: `${APEX_ORIGIN}/skill.md`, type: "text/markdown", title: "Apex skill" },
    { rel: "service-doc", href: `${APEX_ORIGIN}/llms.txt`, type: "text/plain", title: "Apex llms.txt" },
    { rel: "describedby", href: `${APEX_ORIGIN}/discovery/original-task-correspondence.json`, type: "application/json", title: "Original-task help descriptor" },
    { rel: "service-meta", href: `${APEX_ORIGIN}/.well-known/agent-card.json`, type: "application/json", title: "Apex agent card" },
    { rel: "status", href: `${APEX_ORIGIN}/mcp`, type: "text/plain", title: "Apex MCP" },
    { rel: "status", href: `${APEX_ORIGIN}/api/health`, type: "application/json", title: "Apex health" },
  ];
  return {
    linkset: [
      linksetEntry(`${APEX_ORIGIN}/.well-known/api-catalog`, apexLinks),
      linksetEntry(`${PAID_ORIGIN}/`, PAID_GATEWAY_LINKS),
    ],
  };
}

function linksetEntry(anchor, links) {
  const entry = { anchor };
  for (const link of links) {
    if (!REGISTERED_LINK_RELS.has(link.rel)) throw new Error(`Unregistered link relation ${link.rel}`);
    const target = { href: link.href, title: link.title };
    if (link.type) target.type = link.type;
    entry[link.rel] = [...(entry[link.rel] || []), target];
  }
  return entry;
}

export function copyableNoKeyExamples() {
  return [
    {
      id: "get_health",
      method: "GET",
      path: "/api/health",
      headers: { accept: "application/json" },
      expect: { status: 200, contentTypeIncludes: "application/json", equals: { ok: true, service: "samedaydesk" } },
    },
    {
      id: "mcp_initialize",
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json", accept: "application/json", "mcp-protocol-version": SUPPORTED_PROTOCOL_VERSIONS[0] },
      body: jsonRpc("init-1", "initialize", {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: {},
        clientInfo: { name: "apex-discovery-replay", version: "0" },
      }),
      expect: { status: 200, equals: { "result.protocolVersion": SUPPORTED_PROTOCOL_VERSIONS[0], "result.serverInfo.name": SERVER_INFO.name } },
    },
    {
      id: "mcp_tools_list",
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: jsonRpc("list-1", "tools/list"),
      expect: { status: 200, toolsMatchPublished: true },
    },
    {
      id: "plan_taskmarket_delegation",
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: planCallBody(),
      expect: {
        status: 200,
        absent: ["result.isError"],
        equals: {
          "result.structuredContent.authorization.state": "approval_required",
          "result.structuredContent.request.executed": false,
          "result.structuredContent.official_cli.executed": false,
          "result.structuredContent.request.x402_required": true,
        },
      },
    },
  ];
}

export function usefulNegativeExamples() {
  const overSpend = { ...PLAN_ARGUMENTS, reward_usdc: "5", max_spend_usdc: "2" };
  const missingDeadline = { ...PLAN_ARGUMENTS };
  delete missingDeadline.deadline_hours;
  return [
    {
      id: "plan_missing_deadline",
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json" },
      body: planCallBody(missingDeadline, "plan-missing"),
      expect: { status: 200, equals: { "result.isError": true }, bodyIncludes: "deadline_hours", absent: ["result.structuredContent.plan_id"] },
    },
    {
      id: "plan_reward_over_max",
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json" },
      body: planCallBody(overSpend, "plan-over"),
      expect: { status: 200, equals: { "result.isError": true }, bodyIncludes: "max_spend_usdc", absent: ["result.structuredContent.request.executed"] },
    },
    {
      id: "unknown_tool",
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json" },
      body: jsonRpc("bad-tool", "tools/call", { name: "not_a_real_apex_tool", arguments: {} }),
      expect: { status: 200, equals: { "error.code": -32602 }, bodyIncludes: "Unknown tool" },
    },
    {
      id: "unsupported_protocol_header",
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json", "mcp-protocol-version": "1999-01-01" },
      body: jsonRpc("bad-version", "tools/list"),
      expect: { status: 400, equals: { "error.code": -32000 }, bodyIncludes: "1999-01-01" },
    },
    {
      id: "ai_readiness_private_url",
      method: "GET",
      path: "/api/tools/ai-readiness?url=http%3A%2F%2F127.0.0.1%2F",
      headers: { accept: "application/json" },
      expect: { status: 400, contentTypeIncludes: "application/json", bodyIncludes: "isn't reachable" },
    },
    {
      id: "agent_readiness_json_without_host",
      method: "GET",
      path: "/agent-readiness?format=json",
      headers: { accept: "application/json" },
      expect: { status: 400, equals: { error: "Provide a host, for example example.com" } },
    },
  ];
}

export function apexSkillMarkdown() {
  const tools = mcpToolDeclarations();
  const plan = copyableNoKeyExamples().find((example) => example.id === "plan_taskmarket_delegation");
  const lines = [
    "# SameDayDesk apex skills",
    "",
    `Authority: these instructions describe ${APEX_ORIGIN} only.`,
    `Paid machine commerce is a different host, ${PAID_ORIGIN}.`,
    "Its live OpenAPI, MCP, agent card, x402 manifest, health, and action catalog are the authority for payment.",
    "This file does not copy route counts, prices, or payment addresses.",
    "No account signup is required for the free examples below.",
    "",
    "## Protocol",
    "",
    `POST ${APEX_ORIGIN}/mcp with Content-Type application/json.`,
    `Supported MCP-Protocol-Version values, newest first: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`,
    "initialize echoes a supported client protocolVersion. Otherwise it answers the newest supported version.",
    "A present unsupported MCP-Protocol-Version header on a later request is HTTP 400 with JSON-RPC code -32000.",
    "A missing header stays accepted.",
    `Compatibility batches contain ${MCP_BATCH_MIN}..${MCP_BATCH_MAX} entries, without a header or with ${MCP_BATCH_PROTOCOL_VERSIONS.join(" or ")}. The 2024 batch path is an SDS extension.`,
    "Headers 2025-06-18 and 2025-11-25 require one message per POST. Only a valid singleton initialize negotiates despite an unsupported header.",
    "Notifications and accepted responses return 202 with no body. Malformed JSON returns 400/-32700; invalid envelopes and rejected batches return 400/-32600.",
    "An unknown tool name returns JSON-RPC error -32602.",
    `Server: ${SERVER_INFO.name} ${SERVER_INFO.version}.`,
    "",
    "## Free plan that returns useful output",
    "",
    "Call `plan_taskmarket_delegation`. It prepares a TaskMarket payload and does not create a task, hold a wallet, or spend funds.",
    "`request.executed` and `official_cli.executed` are false. `authorization.state` is `approval_required`.",
    "Copy this request. Change the request and deliverable to your own words before you trust the plan id.",
    "",
    "```json",
    JSON.stringify(plan.body, null, 2),
    "```",
    "",
    "## Tools",
    "",
  ];
  for (const tool of tools) {
    lines.push(`### \`${tool.name}\``, "");
    lines.push(tool.description, "");
    lines.push(`Tier: ${tool.authority.tier}. Executes payment: ${tool.authority.executesPayment}. Network: ${tool.authority.network}.`);
    if (tool.authority.http) lines.push(`HTTP: \`${tool.authority.http}\`.`);
    if (tool.authority.rateLimit) lines.push(`Rate limit: ${tool.authority.rateLimit}.`);
    if (tool.authority.note) lines.push(tool.authority.note);
    lines.push("", "Input schema:", "", "```json", JSON.stringify(tool.inputSchema, null, 2), "```", "");
  }
  lines.push(
    "## Optional mounts",
    "",
    "`GET /api/correspondence/healthz` is enabled false unless correspondence configuration is present. A disabled body is not a mailbox.",
    "`GET /api/hosted-useful/healthz` can be mounted while `productionReady` and `publicationVerified` stay false. That is not a working hosted consumer. Do not send job admission here.",
    "`GET /api/public-readiness/healthz` reports the vendored checker. `publicDeployment.activated` stays false.",
    "`GET /discovery/original-task-correspondence.json` names one public original-task client archive. Fetching it does not submit a task, enroll a visitor, or promise delivery. That document is the next action for one public original task through the existing correspondence client. It is not an MCP tool, not a paid gateway call, and not a universal capability. Supported actions are to qualify that public task, then read the same private attempt. Refusals stay explicit for an unrelated surface, a spend request, hosted execution, a stale archive, a handle outside its private directory, and a source label placed on the task. A declared source is not authentication.",
    "",
    "## Paid gateway links",
    "",
  );
  for (const link of PAID_GATEWAY_LINKS) lines.push(`- ${link.title}: ${link.href}`);
  lines.push("", "No paid `/.well-known/api-catalog` is linked. That path is not a live canonical document on the paid host.", "");
  return lines.join("\n");
}

export function apexOpenApiDocument() {
  const catalog = apexApiCatalog();
  const skillMarkdown = apexSkillMarkdown();
  return {
    openapi: "3.1.0",
    info: {
      title: "SameDayDesk apex",
      version: SERVER_INFO.version,
      description: [
        "Free apex HTTP and MCP tools on samedaydesk.com.",
        `Paid machine commerce stays on ${PAID_ORIGIN}. This document links that host and does not copy its route count, prices, or payment authority.`,
        "Account, checkout, upload, and webhook routes exist for signed-in people or provider signatures. They are not free tools and have no copyable example here.",
        "GET /scan is an HTML proof page for people.",
        "GET /api/observatory and GET /api/market-observations read fixed upstreams and can report those upstreams unavailable. They are not the free apex tools in /skill.md.",
        "GET /discovery/original-task-correspondence.json is the no-spend next action for one public original task through existing correspondence. It is not an MCP tool and not a paid gateway operation.",
        "GET routes on this list also answer HEAD with the same headers and an empty body. The declaration routes answer OPTIONS with CORS.",
        "Optional mounts stay explicit: correspondence, hosted useful journey, and public readiness health do not become a hosted consumer because their source is mounted.",
      ].join(" "),
    },
    servers: [{ url: APEX_ORIGIN, description: "Apex free tools" }],
    paths: apexPaths(catalog, skillMarkdown),
    components: {
      schemas: {
        ErrorObject: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" } },
        },
        JsonRpcRequest: rpcMessageSchema(),
        JsonRpcClientResponse: {
          anyOf: [
            { $ref: "#/components/schemas/JsonRpcSuccess" },
            { type: "object", required: ["jsonrpc", "id", "error"], properties: { jsonrpc: { const: "2.0" }, id: rpcIdSchema(), error: { type: "object", required: ["code", "message"], properties: { code: { type: "integer" }, message: { type: "string" } } } } },
          ],
        },
        JsonRpcSuccess: {
          type: "object",
          required: ["jsonrpc", "id", "result"],
          properties: {
            jsonrpc: { const: "2.0" },
            id: rpcIdSchema(),
            result: { type: "object" },
          },
        },
        JsonRpcError: {
          type: "object",
          required: ["jsonrpc", "id", "error"],
          properties: {
            jsonrpc: { const: "2.0" },
            id: { type: ["string", "integer", "null"] },
            error: {
              type: "object",
              required: ["code", "message"],
              properties: { code: { type: "integer" }, message: { type: "string" } },
            },
          },
        },
      },
    },
    "x-mcp-tools": mcpToolDeclarations(),
    "x-protocol-versions": [...SUPPORTED_PROTOCOL_VERSIONS],
    "x-copyable-no-key-examples": copyableNoKeyExamples(),
    "x-useful-negatives": usefulNegativeExamples(),
    "x-paid-gateway": {
      origin: PAID_ORIGIN,
      links: PAID_GATEWAY_LINKS.map((link) => ({ rel: link.rel, href: link.href, type: link.type })),
      note: "Live documents are authoritative. No route count, price, or payment address is copied.",
    },
  };
}

export function declarationBodies() {
  const openapi = apexOpenApiDocument();
  const skill = apexSkillMarkdown();
  const catalog = apexApiCatalog();
  return {
    "/openapi.json": { contentType: "application/openapi+json; charset=utf-8", body: JSON.stringify(openapi) },
    "/skill.md": { contentType: "text/markdown; charset=utf-8", body: skill },
    "/.well-known/api-catalog": {
      contentType: 'application/linkset+json; charset=utf-8; profile="https://www.rfc-editor.org/info/rfc9727"',
      body: JSON.stringify(catalog),
    },
  };
}

function lookup(value, path) {
  if (!path) return value;
  return String(path).split(".").reduce((current, key) => (current == null ? undefined : current[key]), value);
}

export function machineDeclarationProblems(openapi, skillMarkdown, catalog, tools = TOOLS) {
  const problems = [];
  const fail = (message) => problems.push(message);
  if (!openapi || openapi.openapi !== "3.1.0") fail("openapi version must be 3.1.0");
  if (openapi?.servers?.some((server) => server.url !== APEX_ORIGIN)) fail("OpenAPI servers must stay on the apex origin");
  const published = Array.isArray(openapi?.["x-mcp-tools"]) ? openapi["x-mcp-tools"] : null;
  const expected = mcpToolDeclarations(tools);
  if (!published) fail("x-mcp-tools missing");
  else if (JSON.stringify(published) !== JSON.stringify(expected)) fail("x-mcp-tools drifted from the mounted MCP inventory");
  if (JSON.stringify(openapi?.["x-protocol-versions"]) !== JSON.stringify([...SUPPORTED_PROTOCOL_VERSIONS])) {
    fail("protocol versions drifted");
  }
  const ids = new Set();
  for (const [path, item] of Object.entries(openapi?.paths || {})) {
    for (const [method, op] of Object.entries(item || {})) {
      if (!op || typeof op !== "object" || Array.isArray(op)) continue;
      if (!op.operationId) fail(`${method} ${path} missing operationId`);
      else if (ids.has(op.operationId)) fail(`duplicate operationId ${op.operationId}`);
      else ids.add(op.operationId);
      if (!op.summary) fail(`${op.operationId || path} missing summary`);
      if (!Array.isArray(op.security)) fail(`${op.operationId || path} missing security`);
      const responses = op.responses || {};
      const success = Object.entries(responses).find(([code]) => code.startsWith("2") && code !== "202");
      if (!success) fail(`${op.operationId || path} missing 2xx response`);
      else {
        const content = success[1]?.content || {};
        const hasExample = Object.values(content).some((media) => media && (media.example !== undefined || media.examples));
        if (!hasExample) fail(`${op.operationId || path} missing success example`);
      }
      for (const [code, response] of Object.entries(responses)) {
        if (!/^4/.test(code)) continue;
        const content = response?.content || {};
        const hasSchema = Object.values(content).some((media) => media?.schema);
        if (!hasSchema) fail(`${op.operationId || path} ${code} missing schema`);
      }
    }
  }
  for (const id of ["getHealth", "check_ai_readiness", "check_agent_readiness", "mcpJsonRpc"]) {
    if (!ids.has(id)) fail(`missing operation ${id}`);
  }
  for (const tool of tools) {
    if (!skillMarkdown.includes(`\`${tool.name}\``)) fail(`skill.md missing ${tool.name}`);
    if (!skillMarkdown.includes(JSON.stringify(tool.inputSchema, null, 2))) fail(`skill.md schema drifted for ${tool.name}`);
  }
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
    if (!skillMarkdown.includes(version)) fail(`skill.md missing protocol ${version}`);
  }
  if (!catalog || !Array.isArray(catalog.linkset) || catalog.linkset.length < 2) fail("api-catalog linkset missing");
  const seenHrefs = [];
  for (const entry of catalog?.linkset || []) {
    if (typeof entry.anchor !== "string") fail("linkset entry missing anchor");
    for (const [rel, value] of Object.entries(entry)) {
      if (rel === "anchor") continue;
      if (!REGISTERED_LINK_RELS.has(rel)) fail(`unregistered relation ${rel}`);
      if (!Array.isArray(value)) fail(`${rel} is not a link array`);
      for (const link of value || []) {
        if (typeof link?.href !== "string" || !/^https:\/\//.test(link.href)) fail(`bad href on ${rel}`);
        else seenHrefs.push(link.href);
      }
    }
  }
  const apexAnchor = catalog?.linkset?.find((entry) => entry.anchor === `${APEX_ORIGIN}/.well-known/api-catalog`);
  const paidAnchor = catalog?.linkset?.find((entry) => entry.anchor === `${PAID_ORIGIN}/`);
  if (!apexAnchor) fail("apex catalog anchor missing");
  if (!paidAnchor) fail("paid catalog anchor missing");
  for (const link of PAID_GATEWAY_LINKS) {
    if (!seenHrefs.includes(link.href)) fail(`paid link missing ${link.href}`);
  }
  if (seenHrefs.some((href) => href.startsWith(PAID_ORIGIN) && href.includes("/.well-known/api-catalog"))) {
    fail("paid api-catalog was not a live canonical document");
  }
  const blob = JSON.stringify({ openapi, catalog });
  if (/toolCount"\s*:/.test(blob) || blob.includes("0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee")) {
    fail("paid gateway mutable authority was copied");
  }
  const copyable = openapi?.["x-copyable-no-key-examples"];
  if (!Array.isArray(copyable) || !copyable.some((example) => example.id === "plan_taskmarket_delegation")) {
    fail("copyable plan example missing");
  }
  const planExample = (copyable || []).find((example) => example.id === "plan_taskmarket_delegation");
  if (planExample && !skillMarkdown.includes(JSON.stringify(planExample.body, null, 2))) fail("skill.md plan example drifted");
  if (lookup(planToolResult(), "request.executed") !== false) fail("plan contract executed a payment");
  return problems;
}

export function assertMachineDeclarationContract(openapi, skillMarkdown, catalog, tools) {
  const problems = machineDeclarationProblems(openapi, skillMarkdown, catalog, tools);
  if (problems.length) {
    const error = new Error(problems.join("; "));
    error.problems = problems;
    throw error;
  }
}

const DECLARATION_TYPES = Object.freeze({
  "/openapi.json": "application/openapi+json; charset=utf-8",
  "/skill.md": "text/markdown; charset=utf-8",
  "/.well-known/api-catalog": 'application/linkset+json; charset=utf-8; profile="https://www.rfc-editor.org/info/rfc9727"',
});

function sendPreflight(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.set("Access-Control-Max-Age", "600");
  res.set("Link", '</.well-known/api-catalog>; rel="api-catalog"');
  res.sendStatus(204);
}

function sendDeclaration(req, res, body, contentType) {
  const payload = Buffer.from(body, "utf8");
  res.status(200);
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.set("Cache-Control", "no-cache");
  res.set("Link", '</.well-known/api-catalog>; rel="api-catalog"');
  res.set("Content-Type", contentType);
  res.set("Content-Length", String(payload.length));
  if (req.method === "HEAD") return res.end();
  return res.end(payload);
}

export function mountApexDeclarations(app) {
  const builders = {
    "/openapi.json": () => JSON.stringify(apexOpenApiDocument()),
    "/skill.md": () => apexSkillMarkdown(),
    "/.well-known/api-catalog": () => JSON.stringify(apexApiCatalog()),
  };
  for (const path of Object.keys(builders)) {
    if (!DECLARATION_FETCH_PATHS.includes(path)) throw new Error(`declaration path ${path} is not classified`);
    const handler = (req, res) => {
      if (req.method === "OPTIONS") return sendPreflight(res);
      return sendDeclaration(req, res, builders[path](), DECLARATION_TYPES[path]);
    };
    app.options(path, handler);
    app.head(path, handler);
    app.get(path, handler);
  }
  app.options("/.well-known/agent-card.json", (_req, res) => sendPreflight(res));
  return app;
}
