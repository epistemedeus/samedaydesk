const PROBED_AT = "2026-09-24T09:00:00Z";
const LATEST = "2025-11-25";
const notFound = () => ({ status: 404, contentType: "text/plain", body: "Not Found" });
const text = (body, contentType = "text/plain; charset=utf-8") => ({
    status: 200,
    contentType,
    headers: { "content-type": contentType },
    body,
});
const jsonRes = (value, contentType = "application/json") => ({
    status: 200,
    contentType,
    headers: { "content-type": contentType },
    body: JSON.stringify(value, null, 2),
});
const openCors = (paths) => Object.fromEntries(paths.map((p) => [
    p,
    {
        status: 204,
        headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type",
        },
    },
]));
const closedCors = (paths) => Object.fromEntries(paths.map((p) => [p, { status: 405, headers: {} }]));
const ALL_PATHS = [
    "/llms.txt",
    "/skill.md",
    "/openapi.json",
    "/.well-known/openapi.json",
    "/.well-known/agent-card.json",
    "/.well-known/agent.json",
    "/.well-known/api-catalog",
    "/.well-known/x402",
    "/.well-known/mcp.json",
    "/mcp",
    "/robots.txt",
];
function withMissing(present) {
    const out = {};
    for (const p of ALL_PATHS)
        out[p] = present[p] ?? notFound();
    return out;
}
const ROBOTS_OPEN = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

Sitemap: https://%HOST%/sitemap.xml
`;
function robots(host) {
    return text(ROBOTS_OPEN.replace("%HOST%", host));
}
/* ------------------------------ 1. ein.llc ------------------------------- */
const EIN_OPS = [
    ["assessFormation", "post", "/v1/formations/assess", "Assess whether a formation is eligible."],
    ["prepareApplication", "post", "/v1/applications/prepare", "Prepare an EIN application draft."],
    ["claimApplication", "post", "/v1/applications/{id}/claim", "Claim a prepared application."],
    ["reviewApplication", "post", "/v1/applications/{id}/review", "Review a claimed application."],
    ["issueStatusGrant", "post", "/v1/status-grants", "Issue a status grant for an entity."],
    ["listStatusGrants", "get", "/v1/status-grants", "List status grants for an entity."],
    ["revokeStatusGrant", "delete", "/v1/status-grants/{id}", "Revoke an issued status grant."],
    ["getApplicationStatus", "get", "/v1/applications/{id}/status", "Read the status of an application."],
    ["getFormationContract", "get", "/v1/formations/{id}/contract", "Fetch the signed formation contract."],
];
function einOpenapi() {
    const paths = {};
    for (const [operationId, method, path, summary] of EIN_OPS) {
        paths[path] = paths[path] ?? {};
        paths[path][method] = {
            operationId,
            summary,
            security: operationId === "assessFormation" ? [] : [{ bearerAuth: [] }],
            responses: { "200": { description: "OK" } },
        };
    }
    return {
        openapi: "3.1.0",
        info: { title: "ein.llc Formation API", version: "2026-09-01" },
        servers: [{ url: "https://ein.llc" }],
        components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
        paths,
    };
}
const einLlc = {
    schema: "agent-readiness.probe.v1",
    host: "ein.llc",
    probedAt: PROBED_AT,
    label: "DEMO - ein.llc",
    responses: withMissing({
        "/llms.txt": text(`# ein.llc

Entity formation and EIN status grants for US companies.

## API
- OpenAPI: https://ein.llc/openapi.json
- Service catalog: https://ein.llc/.well-known/api-catalog

## Operations
- assessFormation - check eligibility before paying
- prepareApplication - build the filing draft
- claimApplication - attach the draft to an operator
- reviewApplication - human review step
- issueStatusGrant - issue a status grant
- listStatusGrants - list grants for an entity
- revokeStatusGrant - revoke a grant
- getApplicationStatus - poll filing status
- getFormationContract - download the signed contract

## Notes
There is no MCP server and no agent card yet.
`),
        "/skill.md": text(`# Skill: file an EIN with ein.llc

1. Call \`assessFormation\` with the entity type and state.
2. Call \`prepareApplication\` with the assessment id.
3. Call \`claimApplication\`, then \`reviewApplication\`.
4. Poll \`getApplicationStatus\` until it reads granted.
5. Call \`issueStatusGrant\`, then \`listStatusGrants\` to confirm.
6. Use \`revokeStatusGrant\` only to undo a mistaken grant.
7. Download the record with \`getFormationContract\`.

Auth: bearer token on every call except \`assessFormation\`.
`),
        "/openapi.json": jsonRes(einOpenapi()),
        "/.well-known/api-catalog": jsonRes({
            linkset: [
                {
                    anchor: "https://ein.llc",
                    "service-desc": [
                        { href: "https://ein.llc/openapi.json", type: "application/openapi+json" },
                    ],
                    "service-doc": [{ href: "https://ein.llc/skill.md", type: "text/markdown" }],
                },
            ],
        }, "application/linkset+json"),
        "/robots.txt": robots("ein.llc"),
    }),
    corsPreflight: closedCors(ALL_PATHS),
};
/* -------------------------- 2. samedaydesk.com --------------------------- */
const SDD_TOOLS = [
    ["book_desk", "Book a desk for a given day and location."],
    ["cancel_booking", "Cancel an existing desk booking."],
    ["list_locations", "List bookable locations."],
    ["check_availability", "Check desk availability for a date range."],
    ["get_booking", "Read a single booking by id."],
];
const samedaydesk = {
    schema: "agent-readiness.probe.v1",
    host: "samedaydesk.com",
    probedAt: PROBED_AT,
    label: "DEMO - samedaydesk.com",
    responses: withMissing({
        "/llms.txt": text(`# SameDayDesk

Same day desk booking in 40 cities.

## MCP
https://samedaydesk.com/mcp

## Tools
- book_desk
- cancel_booking
- list_locations
- check_availability
- get_booking
`),
        "/mcp": {
            status: 405,
            contentType: "text/plain",
            body: "Method Not Allowed - use POST",
        },
        "/robots.txt": robots("samedaydesk.com"),
    }),
    mcp: {
        url: "https://samedaydesk.com/mcp",
        offeredVersion: LATEST,
        initialize: {
            jsonrpc: "2.0",
            id: 1,
            result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "samedaydesk", version: "1.4.0" },
            },
        },
        toolsList: {
            jsonrpc: "2.0",
            id: 2,
            result: {
                tools: SDD_TOOLS.map(([name, description]) => ({
                    name,
                    description,
                    inputSchema: { type: "object", properties: { id: { type: "string" } } },
                })),
            },
        },
        unknownToolCall: {
            jsonrpc: "2.0",
            id: 3,
            error: { code: -32601, message: "Unknown tool: __definitely_not_a_tool__" },
        },
    },
    corsPreflight: openCors(ALL_PATHS),
};
/* ----------------------- 3. agents.samedaydesk.com ----------------------- */
const AGENT_TOOL_NAMES = [
    "book_desk",
    "cancel_booking",
    "reschedule_booking",
    "list_locations",
    "get_location",
    "check_availability",
    "get_booking",
    "list_bookings",
    "create_team",
    "invite_teammate",
    "remove_teammate",
    "list_teammates",
    "set_team_policy",
    "get_team_policy",
    "create_invoice",
    "get_invoice",
    "list_invoices",
    "pay_invoice",
    "refund_invoice",
    "create_credit_pack",
    "get_credit_balance",
    "list_amenities",
    "request_amenity",
    "report_issue",
    "get_receipt",
];
const READ_ONLY = new Set([
    "list_locations",
    "get_location",
    "check_availability",
    "get_booking",
    "list_bookings",
    "list_teammates",
    "get_team_policy",
    "get_invoice",
    "list_invoices",
    "get_credit_balance",
    "list_amenities",
    "get_receipt",
]);
function humanize(name) {
    return name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
const agentsSamedaydesk = {
    schema: "agent-readiness.probe.v1",
    host: "agents.samedaydesk.com",
    probedAt: PROBED_AT,
    label: "DEMO - agents.samedaydesk.com",
    responses: withMissing({
        "/openapi.json": jsonRes({
            openapi: "3.1.0",
            info: { title: "SameDayDesk Agent API", version: "2026-09-10" },
            servers: [{ url: "https://agents.samedaydesk.com" }],
            components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
            paths: Object.fromEntries(AGENT_TOOL_NAMES.map((name) => [
                `/v1/${name.replace(/_/g, "-")}`,
                {
                    post: {
                        operationId: name,
                        summary: `${humanize(name)}.`,
                        security: READ_ONLY.has(name) ? [] : [{ bearerAuth: [] }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            ])),
        }),
        "/.well-known/agent-card.json": jsonRes({
            protocolVersion: "0.3.0",
            name: "SameDayDesk Agent",
            description: "Books desks, manages teams and settles invoices on behalf of a user.",
            url: "https://agents.samedaydesk.com/a2a",
            version: "2026-09-10",
            interfaces: [
                { transport: "JSONRPC", url: "https://agents.samedaydesk.com/a2a" },
                { transport: "MCP", url: "https://agents.samedaydesk.com/mcp" },
            ],
            skills: AGENT_TOOL_NAMES.map((name) => ({
                id: name,
                name: humanize(name),
                description: `${humanize(name)} through the SameDayDesk agent surface.`,
                tags: ["desk"],
            })),
        }),
        "/.well-known/x402": jsonRes({
            x402Version: 1,
            resources: [
                {
                    resource: "https://agents.samedaydesk.com/v1/book-desk",
                    accepts: [
                        { scheme: "exact", network: "base", maxAmountRequired: "2500000", asset: "USDC" },
                    ],
                },
                {
                    resource: "https://agents.samedaydesk.com/v1/create-credit-pack",
                    accepts: [
                        { scheme: "exact", network: "base", maxAmountRequired: "50000000", asset: "USDC" },
                    ],
                },
            ],
        }),
        "/.well-known/api-catalog": jsonRes({
            linkset: [
                {
                    anchor: "https://agents.samedaydesk.com",
                    "service-desc": [
                        {
                            href: "https://agents.samedaydesk.com/openapi.json",
                            type: "application/openapi+json",
                        },
                    ],
                    "service-meta": [
                        {
                            href: "https://agents.samedaydesk.com/.well-known/agent-card.json",
                            type: "application/json",
                        },
                    ],
                    related: [{ href: "https://agents.samedaydesk.com/mcp", type: "application/json" }],
                },
            ],
        }, "application/linkset+json"),
        "/mcp": { status: 405, contentType: "text/plain", body: "Method Not Allowed - use POST" },
        "/robots.txt": robots("agents.samedaydesk.com"),
    }),
    mcp: {
        url: "https://agents.samedaydesk.com/mcp",
        offeredVersion: LATEST,
        initialize: {
            jsonrpc: "2.0",
            id: 1,
            result: {
                protocolVersion: LATEST,
                capabilities: { tools: { listChanged: true }, resources: {} },
                serverInfo: { name: "samedaydesk-agents", version: "3.0.1" },
            },
        },
        toolsList: {
            jsonrpc: "2.0",
            id: 2,
            result: {
                tools: AGENT_TOOL_NAMES.map((name) => ({
                    name,
                    description: `${humanize(name)} for the signed in account.`,
                    inputSchema: {
                        type: "object",
                        properties: { id: { type: "string", description: "Target identifier." } },
                        required: READ_ONLY.has(name) ? [] : ["id"],
                    },
                    annotations: {
                        title: humanize(name),
                        readOnlyHint: READ_ONLY.has(name),
                        destructiveHint: name.startsWith("remove") || name.startsWith("cancel"),
                        idempotentHint: READ_ONLY.has(name),
                    },
                })),
            },
        },
        unknownToolCall: {
            jsonrpc: "2.0",
            id: 3,
            error: {
                code: -32602,
                message: "Unknown tool: __definitely_not_a_tool__",
                data: { available: AGENT_TOOL_NAMES.length },
            },
        },
    },
    corsPreflight: closedCors(ALL_PATHS),
};
/* ---------------------------- 4. neomorphic.io --------------------------- */
const NEO_OPS = [
    ["renderScene", "post", "/v1/scenes/render", "Render a neomorphic scene from a spec."],
    ["getScene", "get", "/v1/scenes/{id}", "Read a rendered scene."],
    ["listPresets", "get", "/v1/presets", "List shadow and surface presets."],
    ["exportTokens", "post", "/v1/tokens/export", "Export a design token bundle."],
];
const neomorphic = {
    schema: "agent-readiness.probe.v1",
    host: "neomorphic.io",
    probedAt: PROBED_AT,
    label: "DEMO - neomorphic.io",
    responses: withMissing({
        "/llms.txt": text(`# neomorphic.io

Soft UI rendering as a service.

## API
- OpenAPI: https://neomorphic.io/openapi.json
- Skill: https://neomorphic.io/skill.md

## Operations
- renderScene
- getScene
- listPresets
- exportTokens

## Payments
No paid endpoints today, see https://neomorphic.io/.well-known/x402
`),
        "/skill.md": text(`# Skill: render a soft UI scene

1. Call \`listPresets\` and pick a preset id.
2. Call \`renderScene\` with the preset and your layer spec.
3. Poll \`getScene\` until status is ready.
4. Call \`exportTokens\` to get CSS variables for your app.

No credentials are needed for \`listPresets\`.
`),
        "/openapi.json": jsonRes({
            openapi: "3.1.0",
            info: { title: "neomorphic.io API", version: "2026-08-02" },
            servers: [{ url: "https://neomorphic.io" }],
            components: { securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "X-Api-Key" } } },
            paths: Object.fromEntries(NEO_OPS.map(([operationId, method, path, summary]) => [
                path,
                {
                    [method]: {
                        operationId,
                        summary,
                        security: operationId === "listPresets" ? [] : [{ apiKey: [] }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            ])),
        }),
        "/.well-known/x402": jsonRes({
            x402Version: 1,
            resources: [],
            note: "No paid endpoints. This list is intentionally empty and will be filled when metered rendering ships.",
        }),
        "/robots.txt": robots("neomorphic.io"),
    }),
    corsPreflight: openCors(ALL_PATHS),
};
export const DEMO_BUNDLES = [
    einLlc,
    samedaydesk,
    agentsSamedaydesk,
    neomorphic,
];
export function demoBundle(host) {
    const found = DEMO_BUNDLES.find((b) => b.host === host);
    if (!found)
        throw new Error(`No demo bundle for ${host}`);
    return found;
}
