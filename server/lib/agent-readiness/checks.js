import { detectWebMcp, discoverMcpLinks, resolveMcp } from "./discovery.js";
import { usabilityChecks } from "./usability.js";
import { buildIdentityMatrix, extractNamesFromText } from "./normalize.js";
import { classifyRetrieval, contentTypeOf, inspectJsonBody, isHtmlDocument, retrievalDiagnostic, selectDocument, textDocumentVerdict } from "./retrieval.js";
export const LATEST_MCP_VERSION = "2025-11-25";
export const AI_AGENTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];
export const OPENAPI_PATHS = ["/openapi.json", "/.well-known/openapi.json"];
export const AGENT_CARD_PATHS = ["/.well-known/agent-card.json", "/.well-known/agent.json"];
export function ok(res) {
    return !!res && res.status >= 200 && res.status < 300;
}
export function first(bundle, paths) {
    for (const path of paths) {
        const res = bundle.responses[path];
        if (ok(res) && res)
            return { path, res };
    }
    return null;
}
export function json(res) {
    if (!res?.body)
        return null;
    try {
        return JSON.parse(res.body);
    }
    catch {
        return null;
    }
}
export function rec(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
}
const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];
export function openapiOperations(doc) {
    const paths = rec(doc?.paths);
    if (!paths)
        return [];
    const out = [];
    for (const [path, item] of Object.entries(paths)) {
        const entry = rec(item);
        if (!entry)
            continue;
        for (const method of HTTP_METHODS) {
            const op = rec(entry[method]);
            if (op)
                out.push({ path, method, op });
        }
    }
    return out;
}
/* ------------------------------- discovery ------------------------------- */
function discoveryChecks(ctx) {
    const { bundle } = ctx;
    const llms = bundle.responses["/llms.txt"];
    const skill = bundle.responses["/skill.md"];
    const robots = bundle.responses["/robots.txt"];
    const out = [];
    const llmsVerdict = textDocumentVerdict(llms, "/llms.txt", "Publish /llms.txt describing what the site does and linking its machine surfaces.");
    const llmsBody = llmsVerdict.status === "pass" ? (llms?.body ?? "") : "";
    out.push({
        id: "discovery.llms",
        category: "discovery",
        title: "llms.txt published",
        status: llmsVerdict.status,
        reason: llmsVerdict.reason,
        fix: llmsVerdict.fix,
    });
    if (!llmsBody.trim()) {
        out.push({
            id: "discovery.llms.links",
            category: "discovery",
            title: "llms.txt links API, MCP and agent card",
            status: "na",
            reason: "No llms.txt to inspect.",
            fix: "Once /llms.txt exists, link the OpenAPI document, the MCP endpoint and the agent card.",
        });
    }
    else {
        const hasApi = /openapi|\/api\b|api\.json/i.test(llmsBody);
        const hasMcp = /mcp/i.test(llmsBody);
        const hasCard = /agent-card|agent\.json|a2a/i.test(llmsBody);
        const missing = [
            !hasApi ? "API" : null,
            !hasMcp ? "MCP" : null,
            !hasCard ? "agent card" : null,
        ].filter(Boolean);
        out.push({
            id: "discovery.llms.links",
            category: "discovery",
            title: "llms.txt links API, MCP and agent card",
            status: missing.length === 0 ? "pass" : missing.length === 3 ? "fail" : "warn",
            reason: missing.length === 0
                ? "llms.txt links the API, the MCP endpoint and the agent card."
                : `llms.txt does not link: ${missing.join(", ")}.`,
            fix: "Add absolute links to /openapi.json, /mcp and /.well-known/agent-card.json inside llms.txt.",
        });
    }
    const skillVerdict = textDocumentVerdict(skill, "/skill.md", "Publish /skill.md with step by step instructions an agent can follow to use the site.");
    out.push({
        id: "discovery.skill",
        category: "discovery",
        title: "skill.md published",
        status: skillVerdict.status,
        reason: skillVerdict.reason,
        fix: skillVerdict.fix,
    });
    const robotsOutcome = classifyRetrieval(robots);
    const robotsDiagnostic = retrievalDiagnostic("/robots.txt", robotsOutcome, "robots.txt");
    if (robotsOutcome.kind !== "retrieved") {
        out.push({
            id: "discovery.robots",
            category: "discovery",
            title: "robots.txt does not block AI agents",
            status: "warn",
            reason: robotsDiagnostic
                ? `${robotsDiagnostic.reason} Agent rules are therefore unknown.`
                : `/robots.txt returned ${robots?.status ?? "no response"}, so agent rules are undefined.`,
            fix: robotsDiagnostic?.fix ?? "Publish /robots.txt that allows the AI agents you want to be callable by.",
        });
    }
    else if (isHtmlDocument(robots)) {
        out.push({
            id: "discovery.robots",
            category: "discovery",
            title: "robots.txt does not block AI agents",
            status: "warn",
            reason: `/robots.txt returned HTTP ${robots.status} as ${contentTypeOf(robots) || "HTML"}, so agent rules were not read.`,
            fix: "Serve /robots.txt as plain text. An HTML page does not define agent rules and is not evidence they are missing.",
        });
    }
    else {
        const blocked = blockedAgents(robots?.body ?? "");
        out.push({
            id: "discovery.robots",
            category: "discovery",
            title: "robots.txt does not block AI agents",
            status: blocked.length === 0 ? "pass" : "fail",
            reason: blocked.length === 0
                ? "robots.txt does not disallow the common AI agents."
                : `robots.txt disallows: ${blocked.join(", ")}.`,
            fix: "Remove the blanket Disallow for AI agent user agents, or narrow it to private paths.",
        });
    }
    return out;
}
export function blockedAgents(robots) {
    const lines = robots.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
    const blocked = new Set();
    let group = [];
    let disallowAll = false;
    const flush = () => {
        if (disallowAll) {
            for (const ua of group) {
                if (ua === "*")
                    AI_AGENTS.forEach((a) => blocked.add(a));
                else {
                    const match = AI_AGENTS.find((a) => a.toLowerCase() === ua.toLowerCase());
                    if (match)
                        blocked.add(match);
                }
            }
        }
        group = [];
        disallowAll = false;
    };
    let seenDirective = false;
    for (const line of lines) {
        const colon = line.indexOf(":");
        if (colon === -1)
            continue;
        const key = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (key === "user-agent") {
            if (seenDirective)
                flush();
            group.push(value);
            seenDirective = false;
        }
        else if (key === "disallow") {
            if (value === "/")
                disallowAll = true;
            seenDirective = true;
        }
        else if (key === "allow") {
            if (value === "/")
                disallowAll = false;
            seenDirective = true;
        }
    }
    flush();
    return [...blocked];
}
/* -------------------------------- openapi -------------------------------- */
function openapiChecks(ctx) {
    const selected = selectDocument(ctx.bundle, OPENAPI_PATHS);
    const inspected = selected.chosen ? inspectJsonBody(selected.chosen.res, selected.chosen.path) : null;
    const doc = inspected?.state === "object" ? inspected.value : null;
    const out = [];
    const unread = retrievalDiagnostic(selected.blocking?.path || "/openapi.json", selected.blocking?.outcome);
    out.push({
        id: "openapi.parses",
        category: "openapi",
        title: "OpenAPI document parses",
        status: doc ? "pass" : "fail",
        reason: doc
            ? inspected.reason
            : unread
                ? unread.reason
                : inspected?.reason || "No OpenAPI document at /openapi.json or /.well-known/openapi.json.",
        fix: doc
            ? "Serve a valid JSON OpenAPI document at /openapi.json."
            : unread?.fix || inspected?.fix || "Serve a valid JSON OpenAPI document at /openapi.json.",
    });
    const na = (id, title, fix, reason = "No parsable OpenAPI document.") => ({
        id,
        category: "openapi",
        title,
        status: "na",
        reason,
        fix,
    });
    if (!doc) {
        const unreadReason = unread ? "The OpenAPI document was not read." : "No parsable OpenAPI document.";
        return [
            ...out,
            na("openapi.version", "OpenAPI version is 3.x", "Use OpenAPI 3.0 or 3.1.", unreadReason),
            na("openapi.operationId", "Every operation has an operationId", "Add an operationId to each operation.", unreadReason),
            na("openapi.summary", "Every operation has a summary", "Add a one-line summary to each operation.", unreadReason),
            na("openapi.security", "Every operation declares security", "Declare security per operation.", unreadReason),
            na("openapi.public", "Public operations are marked", "Mark public operations with security: [].", unreadReason),
        ];
    }
    const version = typeof doc.openapi === "string" ? doc.openapi : "";
    out.push({
        id: "openapi.version",
        category: "openapi",
        title: "OpenAPI version is 3.x",
        status: /^3\./.test(version) ? "pass" : "fail",
        reason: version ? `Declared version is ${version}.` : "No openapi version field found.",
        fix: "Upgrade the document to OpenAPI 3.0 or 3.1 so agent tooling can read it.",
    });
    const ops = openapiOperations(doc);
    const hasGlobalSecurity = Array.isArray(doc.security);
    const missingId = ops.filter((o) => typeof o.op.operationId !== "string" || !o.op.operationId);
    out.push({
        id: "openapi.operationId",
        category: "openapi",
        title: "Every operation has an operationId",
        status: ops.length === 0 ? "fail" : missingId.length === 0 ? "pass" : "warn",
        reason: ops.length === 0
            ? "The document declares no operations."
            : missingId.length === 0
                ? `All ${ops.length} operations have an operationId.`
                : `${missingId.length} of ${ops.length} operations have no operationId.`,
        fix: "Give every operation a stable, unique operationId that agents can call by name.",
    });
    const missingSummary = ops.filter((o) => typeof o.op.summary !== "string" || !o.op.summary);
    out.push({
        id: "openapi.summary",
        category: "openapi",
        title: "Every operation has a summary",
        status: ops.length === 0 ? "na" : missingSummary.length === 0 ? "pass" : "warn",
        reason: ops.length === 0
            ? "The document declares no operations."
            : missingSummary.length === 0
                ? `All ${ops.length} operations have a summary.`
                : `${missingSummary.length} of ${ops.length} operations have no summary.`,
        fix: "Add a one-line summary to each operation so an agent can pick the right call.",
    });
    const missingSecurity = ops.filter((o) => !Array.isArray(o.op.security) && !hasGlobalSecurity);
    out.push({
        id: "openapi.security",
        category: "openapi",
        title: "Every operation declares security",
        status: ops.length === 0 ? "na" : missingSecurity.length === 0 ? "pass" : "warn",
        reason: missingSecurity.length === 0
            ? hasGlobalSecurity && ops.every((o) => !Array.isArray(o.op.security))
                ? "Security is declared globally for all operations."
                : "Every operation declares its own security requirement."
            : `${missingSecurity.length} of ${ops.length} operations declare no security.`,
        fix: "Declare a security requirement per operation, or a document level default plus overrides.",
    });
    const publicOps = ops.filter((o) => (Array.isArray(o.op.security) && o.op.security.length === 0) || o.op["x-public"] === true);
    out.push({
        id: "openapi.public",
        category: "openapi",
        title: "Public operations are marked",
        status: ops.length === 0 ? "na" : publicOps.length > 0 ? "pass" : "warn",
        reason: publicOps.length > 0
            ? `${publicOps.length} operations are explicitly marked callable without credentials.`
            : "No operation is marked as public, so an agent cannot tell where to start.",
        fix: "Mark at least one no-credentials entry point with security: [] so agents can begin.",
    });
    return out;
}
/* ---------------------------------- mcp ---------------------------------- */
export function mcpTools(toolsList) {
    const result = rec(rec(toolsList)?.result) ?? rec(toolsList);
    const tools = result?.tools;
    return Array.isArray(tools) ? tools.map((t) => rec(t)).filter(Boolean) : [];
}
function mcpChecks(ctx) {
    const mcp = ctx.bundle.mcp;
    const na = (id, title, fix) => ({
        id,
        category: "mcp",
        title,
        status: "na",
        reason: "No MCP server responded, so nothing could be checked.",
        fix,
    });
    const mcpGet = ctx.bundle.responses["/mcp"];
    const initResult = rec(rec(mcp?.initialize)?.result);
    const mcpDiagnostic = !initResult && !mcp
        ? retrievalDiagnostic("/mcp", classifyRetrieval(mcpGet), "endpoint response")
        : null;
    const present = {
        id: "mcp.initialize",
        category: "mcp",
        title: "MCP initialize succeeds",
        status: initResult ? "pass" : "fail",
        reason: initResult
            ? `initialize returned a result from ${mcp.url}.`
            : mcp
                ? "initialize returned no result object."
                : mcpDiagnostic?.reason || `No MCP server (/mcp returned ${mcpGet?.status ?? "no response"}).`,
        fix: mcpDiagnostic?.fix || "Expose an MCP endpoint at /mcp that answers the initialize handshake.",
    };
    if (!initResult) {
        return [
            present,
            na("mcp.version", "Server honours the offered protocolVersion", "Echo the client's protocolVersion when you support it."),
            na("mcp.tools", "tools/list returns named, described tools", "Return tools with name and description."),
            na("mcp.inputSchema", "Tools declare an inputSchema", "Give every tool a JSON Schema for its arguments."),
            na("mcp.annotations", "Tools declare annotations", "Add annotations such as readOnlyHint to each tool."),
            na("mcp.unknownTool", "Unknown tool returns JSON-RPC -32602", "Return error code -32602 for an unknown tool name."),
        ];
    }
    const out = [present];
    const served = typeof initResult.protocolVersion === "string" ? initResult.protocolVersion : "";
    const offered = mcp.offeredVersion;
    const honoured = served === offered;
    const old = served && served < LATEST_MCP_VERSION;
    out.push({
        id: "mcp.version",
        category: "mcp",
        title: "Server honours the offered protocolVersion",
        status: honoured ? "pass" : old ? "warn" : "fail",
        reason: honoured
            ? `Server returned the offered protocolVersion ${served}.`
            : served
                ? `Offered ${offered} but the server answered ${served}, so it is an old-only server.`
                : "The server returned no protocolVersion.",
        fix: `Support MCP protocol version ${LATEST_MCP_VERSION} and echo the client's version when you can honour it.`,
    });
    const tools = mcpTools(mcp.toolsList);
    const named = tools.filter((t) => typeof t.name === "string" && t.name);
    const described = tools.filter((t) => typeof t.description === "string" && t.description);
    out.push({
        id: "mcp.tools",
        category: "mcp",
        title: "tools/list returns named, described tools",
        status: tools.length === 0 ? "fail" : named.length === tools.length && described.length === tools.length ? "pass" : "warn",
        reason: tools.length === 0
            ? "tools/list returned no tools."
            : `${tools.length} tools, ${named.length} named, ${described.length} described.`,
        fix: "Give every MCP tool a stable name and a one-sentence description.",
    });
    const withSchema = tools.filter((t) => rec(t.inputSchema));
    out.push({
        id: "mcp.inputSchema",
        category: "mcp",
        title: "Tools declare an inputSchema",
        status: tools.length === 0 ? "na" : withSchema.length === tools.length ? "pass" : "warn",
        reason: tools.length === 0
            ? "No tools to inspect."
            : `${withSchema.length} of ${tools.length} tools declare an inputSchema.`,
        fix: "Publish a JSON Schema inputSchema for every tool so agents can build valid calls.",
    });
    const withAnnotations = tools.filter((t) => {
        const a = rec(t.annotations);
        return !!a && Object.keys(a).length > 0;
    });
    out.push({
        id: "mcp.annotations",
        category: "mcp",
        title: "Tools declare annotations",
        status: tools.length === 0
            ? "na"
            : withAnnotations.length === tools.length
                ? "pass"
                : withAnnotations.length === 0
                    ? "fail"
                    : "warn",
        reason: tools.length === 0
            ? "No tools to inspect."
            : `${withAnnotations.length} of ${tools.length} tools carry annotations such as readOnlyHint.`,
        fix: "Add annotations (readOnlyHint, destructiveHint, idempotentHint) so agents know what is safe to retry.",
    });
    const err = rec(rec(mcp.unknownToolCall)?.error);
    const code = typeof err?.code === "number" ? err.code : null;
    out.push({
        id: "mcp.unknownTool",
        category: "mcp",
        title: "Unknown tool returns JSON-RPC -32602",
        status: code === -32602 ? "pass" : code !== null ? "warn" : "fail",
        reason: code === -32602
            ? "Calling an unknown tool returned error code -32602."
            : code !== null
                ? `Calling an unknown tool returned error code ${code} instead of -32602.`
                : "Calling an unknown tool returned no JSON-RPC error.",
        fix: "Return a JSON-RPC error with code -32602 (invalid params) when a tool name is unknown.",
    });
    return out;
}
/* ------------------------------- agent card ------------------------------- */
function agentCardChecks(ctx) {
    const selected = selectDocument(ctx.bundle, AGENT_CARD_PATHS);
    const inspected = selected.chosen ? inspectJsonBody(selected.chosen.res, selected.chosen.path) : null;
    const card = inspected?.state === "object" ? inspected.value : null;
    const unread = retrievalDiagnostic(selected.blocking?.path || "/.well-known/agent-card.json", selected.blocking?.outcome);
    const out = [];
    out.push({
        id: "agentCard.present",
        category: "agentCard",
        title: "Agent card is valid JSON with name and description",
        status: card && typeof card.name === "string" && typeof card.description === "string" ? "pass" : card ? "warn" : "fail",
        reason: card
            ? typeof card.name === "string" && typeof card.description === "string"
                ? `${selected.chosen.path} declares name and description.`
                : `${selected.chosen.path} parsed but is missing name or description.`
            : unread?.reason || inspected?.reason || "No agent card at /.well-known/agent-card.json or /.well-known/agent.json.",
        fix: unread?.fix || (inspected && inspected.state !== "object" ? inspected.fix : "Publish an A2A agent card at /.well-known/agent-card.json with name and description."),
    });
    if (!card) {
        const unreadReason = unread ? "The agent card was not read." : "No agent card to inspect.";
        return [
            ...out,
            {
                id: "agentCard.skills",
                category: "agentCard",
                title: "Agent card lists non-empty skills",
                status: "na",
                reason: unreadReason,
                fix: "List each callable skill with an id, name and description in the agent card.",
            },
            {
                id: "agentCard.interfaces",
                category: "agentCard",
                title: "Agent card declares interfaces",
                status: "na",
                reason: unreadReason,
                fix: "Declare the transports agents can use in the card's interfaces array.",
            },
        ];
    }
    const skills = Array.isArray(card.skills) ? card.skills : [];
    out.push({
        id: "agentCard.skills",
        category: "agentCard",
        title: "Agent card lists non-empty skills",
        status: skills.length > 0 ? "pass" : "fail",
        reason: skills.length > 0 ? `The card lists ${skills.length} skills.` : "The card lists no skills.",
        fix: "List each callable skill with an id, name and description in the agent card.",
    });
    const interfaces = Array.isArray(card.interfaces)
        ? card.interfaces
        : Array.isArray((rec(card.capabilities) ?? {}).interfaces)
            ? (rec(card.capabilities).interfaces)
            : [];
    out.push({
        id: "agentCard.interfaces",
        category: "agentCard",
        title: "Agent card declares interfaces",
        status: interfaces.length > 0 ? "pass" : "warn",
        reason: interfaces.length > 0 ? `The card declares ${interfaces.length} interfaces.` : "The card declares no interfaces.",
        fix: "Declare the transports agents can use (JSON-RPC, HTTP, MCP) in the interfaces array.",
    });
    return out;
}
/* ------------------------------- identity -------------------------------- */
export function collectNamedOperations(bundle) {
    const llms = bundle.responses["/llms.txt"];
    const skill = bundle.responses["/skill.md"];
    const openapiChoice = selectDocument(bundle, OPENAPI_PATHS).chosen;
    const openapi = openapiChoice ? inspectJsonBody(openapiChoice.res, openapiChoice.path).value : null;
    const cardChoice = selectDocument(bundle, AGENT_CARD_PATHS).chosen;
    const card = cardChoice ? inspectJsonBody(cardChoice.res, cardChoice.path).value : null;
    const named = {};
    if (ok(llms) && llms?.body && !isHtmlDocument(llms) && classifyRetrieval(llms).kind === "retrieved")
        named["llms.txt"] = extractNamesFromText(llms.body);
    if (ok(skill) && skill?.body && !isHtmlDocument(skill) && classifyRetrieval(skill).kind === "retrieved")
        named["skill.md"] = extractNamesFromText(skill.body);
    if (openapi) {
        named.openapi = openapiOperations(openapi)
            .map((o) => (typeof o.op.operationId === "string" ? o.op.operationId : ""))
            .filter(Boolean);
    }
    if (bundle.mcp?.toolsList) {
        named.mcp = mcpTools(bundle.mcp.toolsList)
            .map((t) => (typeof t.name === "string" ? t.name : ""))
            .filter(Boolean);
    }
    if (card && Array.isArray(card.skills)) {
        named.agentCard = card.skills
            .map((s) => {
            const r = rec(s);
            const v = r?.id ?? r?.name;
            return typeof v === "string" ? v : "";
        })
            .filter(Boolean);
    }
    return named;
}
function identityChecks(matrix) {
    const surfaces = matrix.activeSurfaces;
    const out = [];
    out.push({
        id: "identity.surfaces",
        category: "identity",
        title: "At least two surfaces name the same operations",
        status: surfaces.length >= 2 ? "pass" : "fail",
        reason: surfaces.length >= 2
            ? `${surfaces.length} surfaces name operations: ${surfaces.join(", ")}.`
            : surfaces.length === 1
                ? `Only ${surfaces[0]} names any operation.`
                : "No surface names any operation.",
        fix: "Describe the same operations in llms.txt, skill.md, OpenAPI, MCP and the agent card.",
    });
    const consistent = matrix.operations.filter((name) => surfaces.every((s) => matrix.present[name]?.[s]));
    out.push({
        id: "identity.consistency",
        category: "identity",
        title: "Operation names agree across surfaces",
        status: surfaces.length < 2
            ? "na"
            : matrix.mismatches.length === 0
                ? "pass"
                : "warn",
        reason: surfaces.length < 2
            ? "Fewer than two surfaces name operations."
            : matrix.mismatches.length === 0
                ? `All ${matrix.operations.length} operations appear on every naming surface.`
                : `${consistent.length} of ${matrix.operations.length} operations appear on every naming surface.`,
        fix: "Use one canonical name per operation everywhere; camelCase and snake_case spellings are treated as equal.",
    });
    return out;
}
/* --------------------------------- x402 ---------------------------------- */
function x402Checks(ctx) {
    const res = ctx.bundle.responses["/.well-known/x402"];
    const outcome = classifyRetrieval(res);
    const inspected = outcome.kind === "retrieved" ? inspectJsonBody(res, "/.well-known/x402") : null;
    const doc = inspected?.state === "object" ? inspected.value : null;
    const unread = retrievalDiagnostic("/.well-known/x402", outcome);
    const out = [];
    out.push({
        id: "x402.parses",
        category: "x402",
        title: "x402 payment manifest parses",
        status: doc ? "pass" : outcome.kind === "retrieved" ? "warn" : "fail",
        reason: doc
            ? "/.well-known/x402 parsed as JSON."
            : unread?.reason || inspected?.reason || `/.well-known/x402 returned ${res?.status ?? "no response"}.`,
        fix: unread?.fix || inspected?.fix || "Publish a JSON x402 manifest at /.well-known/x402, even if it lists no paid resources yet.",
    });
    if (!doc) {
        return [
            ...out,
            {
                id: "x402.resources",
                category: "x402",
                title: "Paid resource list is truthful",
                status: "na",
                reason: unread ? "The x402 manifest was not read." : "No parsable x402 manifest.",
                fix: "List paid resources, or state plainly that there are none.",
            },
        ];
    }
    const resources = Array.isArray(doc.resources)
        ? doc.resources
        : Array.isArray((rec(doc.x402) ?? {}).resources)
            ? (rec(doc.x402).resources)
            : [];
    const declaresEmpty = resources.length === 0 &&
        (doc.resources !== undefined || rec(doc.x402)?.resources !== undefined) &&
        /none|no paid|empty|free/i.test(JSON.stringify(doc));
    out.push({
        id: "x402.resources",
        category: "x402",
        title: "Paid resource list is truthful",
        status: resources.length > 0 || declaresEmpty ? "pass" : "warn",
        reason: resources.length > 0
            ? `${resources.length} paid resources are published.`
            : declaresEmpty
                ? "The manifest publishes an empty resource list and says so plainly."
                : "The manifest has no resources and does not say whether that is intentional.",
        fix: "List paid resources, or keep an empty list with a note stating there are no paid endpoints.",
    });
    return out;
}
/* ---------------------------------- cors --------------------------------- */
const PUBLIC_ROUTES = [
    "/llms.txt",
    "/openapi.json",
    "/.well-known/agent-card.json",
    "/.well-known/api-catalog",
    "/mcp",
];
function corsChecks(ctx) {
    const pre = ctx.bundle.corsPreflight ?? {};
    const relevant = PUBLIC_ROUTES.filter((p) => pre[p] !== undefined || ok(ctx.bundle.responses[p]) || (p === "/mcp" && ctx.bundle.mcp));
    const allowed = relevant.filter((p) => {
        const entry = pre[p];
        if (!entry)
            return false;
        const headers = Object.fromEntries(Object.entries(entry.headers).map(([k, v]) => [k.toLowerCase(), v]));
        const origin = headers["access-control-allow-origin"];
        return entry.status < 400 && (origin === "*" || !!origin);
    });
    return [
        {
            id: "cors.preflight",
            category: "cors",
            title: "Browser agents can read the public routes",
            status: relevant.length === 0
                ? "fail"
                : allowed.length === relevant.length
                    ? "pass"
                    : allowed.length > 0
                        ? "warn"
                        : "fail",
            reason: relevant.length === 0
                ? "No public discovery route was available to preflight."
                : `${allowed.length} of ${relevant.length} public routes answer a preflight with Access-Control-Allow-Origin.`,
            fix: "Return Access-Control-Allow-Origin: * on the public discovery routes and answer OPTIONS requests.",
        },
    ];
}
/* ------------------------------ api-catalog ------------------------------ */
function apiCatalogChecks(ctx) {
    const res = ctx.bundle.responses["/.well-known/api-catalog"];
    const outcome = classifyRetrieval(res);
    const present = outcome.kind === "retrieved";
    const doc = present ? rec(json(res)) : null;
    const unread = retrievalDiagnostic("/.well-known/api-catalog", outcome);
    const out = [];
    out.push({
        id: "apiCatalog.present",
        category: "apiCatalog",
        title: "RFC 9727 api-catalog published",
        status: present ? "pass" : "fail",
        reason: present
            ? `/.well-known/api-catalog returned ${res?.status ?? 0}.`
            : unread?.reason || `/.well-known/api-catalog returned ${res?.status ?? "no response"}.`,
        fix: unread?.fix || "Publish an RFC 9727 linkset at /.well-known/api-catalog listing every machine surface.",
    });
    if (!present) {
        const unreadReason = unread ? "The api-catalog was not read." : "No api-catalog to inspect.";
        return [
            ...out,
            {
                id: "apiCatalog.contentType",
                category: "apiCatalog",
                title: "api-catalog is application/linkset+json",
                status: "na",
                reason: unreadReason,
                fix: "Serve the catalog with Content-Type: application/linkset+json.",
            },
            {
                id: "apiCatalog.links",
                category: "apiCatalog",
                title: "api-catalog links resolve",
                status: "na",
                reason: unreadReason,
                fix: "Point every catalog link at a path that actually returns 200.",
            },
        ];
    }
    const ct = (res?.contentType ?? res?.headers?.["content-type"] ?? "").toLowerCase();
    out.push({
        id: "apiCatalog.contentType",
        category: "apiCatalog",
        title: "api-catalog is application/linkset+json",
        status: ct.includes("application/linkset+json") ? "pass" : "warn",
        reason: ct
            ? `Served as ${ct}.`
            : "No Content-Type was recorded for the catalog.",
        fix: "Serve the catalog with Content-Type: application/linkset+json as RFC 9727 requires.",
    });
    const linkset = Array.isArray(doc?.linkset) ? doc.linkset : [];
    const targets = [];
    for (const entry of linkset) {
        const anchorObj = rec(entry);
        if (!anchorObj)
            continue;
        for (const [key, value] of Object.entries(anchorObj)) {
            if (key === "anchor")
                continue;
            if (!Array.isArray(value))
                continue;
            for (const item of value) {
                const href = rec(item)?.href;
                if (typeof href === "string")
                    targets.push(href);
            }
        }
    }
    const resolved = targets.filter((href) => {
        const path = hrefPath(href);
        return path !== null && (ok(ctx.bundle.responses[path]) || (path === "/mcp" && !!ctx.bundle.mcp));
    });
    out.push({
        id: "apiCatalog.links",
        category: "apiCatalog",
        title: "api-catalog links resolve",
        status: targets.length === 0
            ? "fail"
            : resolved.length === targets.length
                ? "pass"
                : resolved.length > 0
                    ? "warn"
                    : "fail",
        reason: targets.length === 0
            ? "The catalog lists no links."
            : `${resolved.length} of ${targets.length} catalog links resolve inside this bundle.`,
        fix: "Point every catalog link at a path that actually returns 200 in the same probe.",
    });
    return out;
}
function hrefPath(href) {
    try {
        if (href.startsWith("/"))
            return href;
        return new URL(href).pathname;
    }
    catch {
        return null;
    }
}
/* --------------------------- linked discovery ---------------------------- */
export function mcpDiscoveryCheck(bundle) {
    const links = discoverMcpLinks(bundle).filter((l) => l.kind === "endpoint");
    const answering = [bundle.mcp, ...(bundle.linkedMcp ?? [])].filter((m) => !!rec(rec(m?.initialize)?.result));
    const base = {
        id: "mcp.discovered",
        category: "mcp",
        title: "MCP endpoint linked from discovery files",
        fix: "Add an \"mcp-endpoint: https://...\" line to llms.txt and list the server in the api-catalog.",
    };
    const where = (l) => `${l.url} (found in ${l.sources.join(", ")})`;
    const linkedAnswering = links.filter((l) => answering.some((m) => m.url === l.url));
    if (linkedAnswering.length) {
        const other = linkedAnswering.find((l) => new URL(l.url).host !== bundle.host);
        return {
            ...base,
            status: "pass",
            reason: `Linked and answering: ${linkedAnswering.map(where).join("; ")}${other ? ` - on host ${new URL(other.url).host}` : ""}.`,
        };
    }
    if (links.length) {
        return {
            ...base,
            status: "warn",
            reason: `Linked but not probed or not answering: ${links.map(where).join("; ")}.`,
            fix: "Run the probe script so the linked MCP endpoints are followed, and make sure they answer initialize.",
        };
    }
    if (answering.length) {
        return {
            ...base,
            status: "warn",
            reason: `${answering[0].url} answers, but no discovery file links it.`,
        };
    }
    return { ...base, status: "fail", reason: "No discovery file links an MCP endpoint and none answered." };
}
export function webMcpCheck(bundle) {
    const found = detectWebMcp(bundle);
    return {
        id: "webmcp.declared",
        category: "webmcp",
        title: "WebMCP surface declared (emerging)",
        status: found.length ? "pass" : "na",
        reason: found.length
            ? `Declared: ${found.join("; ")}.`
            : "No page or llms.txt declares navigator.modelContext or document.modelContext. Informational only.",
        fix: "If your pages expose tools to in-browser agents, register them via navigator.modelContext and add \"webmcp-api: navigator.modelContext\" to llms.txt.",
    };
}
/* -------------------------------- runner --------------------------------- */
export function runChecks(input) {
    const resolved = resolveMcp(input);
    const bundle = resolved === input.mcp ? input : { ...input, mcp: resolved };
    const names = collectNamedOperations(bundle);
    const ctx = { bundle, names };
    const identity = buildIdentityMatrix(names);
    const checks = [
        ...discoveryChecks(ctx),
        ...openapiChecks(ctx),
        ...mcpChecks(ctx),
        mcpDiscoveryCheck(input),
        ...agentCardChecks(ctx),
        ...identityChecks(identity),
        ...x402Checks(ctx),
        ...corsChecks(ctx),
        ...apiCatalogChecks(ctx),
        ...usabilityChecks(bundle),
        webMcpCheck(input),
    ];
    return { checks, identity };
}
