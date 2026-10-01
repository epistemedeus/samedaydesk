import { strToU8, zipSync } from "./zip.js";
import { AGENT_CARD_PATHS, LATEST_MCP_VERSION, OPENAPI_PATHS, first, json, mcpTools, ok, openapiOperations, rec, } from "./checks.js";
export const API_CATALOG_PATH = "/.well-known/api-catalog";
export function fixPackHeader(bundle) {
    return `generated from probe bundle ${bundle.host} ${bundle.probedAt}; review before publishing`;
}
function surfaces(bundle) {
    const oa = first(bundle, OPENAPI_PATHS);
    const doc = oa ? rec(json(oa.res)) : null;
    const card = first(bundle, AGENT_CARD_PATHS);
    const init = rec(rec(bundle.mcp?.initialize)?.result);
    return {
        origin: `https://${bundle.host}`,
        openapi: oa && doc ? { path: oa.path, doc } : null,
        llms: ok(bundle.responses["/llms.txt"]),
        skill: ok(bundle.responses["/skill.md"]),
        agentCard: card && rec(json(card.res)) ? card.path : null,
        x402: ok(bundle.responses["/.well-known/x402"]),
        mcpUrl: bundle.mcp?.url && init ? bundle.mcp.url : null,
        mcpVersion: typeof init?.protocolVersion === "string" ? init.protocolVersion : null,
        mcpServerInfo: rec(init?.serverInfo),
    };
}
const jsonFile = (header, body) => `${JSON.stringify({ $comment: header, ...body }, null, 2)}\n`;
function skillsFrom(bundle, s) {
    const tools = mcpTools(bundle.mcp?.toolsList).filter((t) => typeof t.name === "string");
    if (tools.length) {
        return {
            source: "MCP tools",
            skills: tools.map((t) => ({
                id: t.name,
                name: t.annotations?.title ?? t.name,
                description: typeof t.description === "string" ? t.description : "TODO: describe this skill.",
                tags: [],
            })),
        };
    }
    const ops = openapiOperations(s.openapi?.doc ?? null).filter((o) => typeof o.op.operationId === "string");
    if (ops.length) {
        return {
            source: "OpenAPI operationIds",
            skills: ops.map((o) => ({
                id: o.op.operationId,
                name: o.op.operationId,
                description: o.op.summary ?? o.op.description ?? "TODO: describe this skill.",
                tags: [],
            })),
        };
    }
    return null;
}
export function generateFixPack(bundle) {
    const header = fixPackHeader(bundle);
    const s = surfaces(bundle);
    const files = [];
    const skipped = [];
    const url = (path) => `${s.origin}${path}`;
    // 1. agent-card.json
    const skills = skillsFrom(bundle, s);
    if (!skills) {
        skipped.push({ path: "agent-card.json", reason: "no MCP tools or OpenAPI operationIds to derive skills from" });
    }
    else {
        const interfaces = [];
        if (s.mcpUrl)
            interfaces.push({ transport: "MCP", url: s.mcpUrl });
        const info = rec(s.openapi?.doc?.info);
        files.push({
            path: "agent-card.json",
            description: `A2A agent card skeleton with ${skills.skills.length} skills from ${skills.source}${s.agentCard ? `; compare with the published ${s.agentCard}` : ""}.`,
            content: jsonFile(header, {
                name: s.mcpServerInfo?.name ?? info?.title ?? bundle.host,
                description: info?.description ?? `TODO: one sentence on what ${bundle.host} does for agents.`,
                version: s.mcpServerInfo?.version ?? info?.version ?? "0.1.0",
                ...(interfaces.length ? { interfaces } : {}),
                _todo: interfaces.length
                    ? "Add an A2A JSON-RPC interface only if you run one."
                    : "No agent-callable endpoint was found in the bundle; add interfaces before publishing.",
                capabilities: {},
                defaultInputModes: ["application/json"],
                defaultOutputModes: ["application/json"],
                skills: skills.skills,
            }),
        });
    }
    // 2. api-catalog linkset
    const item = [];
    if (s.openapi)
        item.push({ "service-desc": [{ href: url(s.openapi.path), type: "application/openapi+json" }] });
    if (s.llms)
        item.push({ "service-doc": [{ href: url("/llms.txt"), type: "text/plain" }] });
    if (s.skill)
        item.push({ "service-doc": [{ href: url("/skill.md"), type: "text/markdown" }] });
    if (s.mcpUrl)
        item.push({ "service-desc": [{ href: s.mcpUrl, title: "MCP server" }] });
    if (s.agentCard)
        item.push({ "service-meta": [{ href: url(s.agentCard), type: "application/json" }] });
    if (item.length === 0) {
        skipped.push({ path: "api-catalog.linkset.json", reason: "no API, MCP, agent card or docs surface exists to link" });
    }
    else {
        const merged = { anchor: url(API_CATALOG_PATH) };
        for (const entry of item) {
            for (const [rel, links] of Object.entries(entry))
                merged[rel] = [...(merged[rel] ?? []), ...links];
        }
        files.push({
            path: "api-catalog.linkset.json",
            description: `RFC 9727 linkset for ${API_CATALOG_PATH}; serve it as application/linkset+json.`,
            content: jsonFile(header, { linkset: [merged] }),
        });
    }
    // 3. llms.txt additions
    const lines = [];
    if (s.openapi) {
        const n = openapiOperations(s.openapi.doc).length;
        lines.push(`- [OpenAPI](${url(s.openapi.path)}): HTTP API description with ${n} operations.`);
    }
    if (s.mcpUrl) {
        const n = mcpTools(bundle.mcp?.toolsList).length;
        lines.push(`- [MCP server](${s.mcpUrl}): Model Context Protocol endpoint with ${n} tools.`);
    }
    if (s.agentCard)
        lines.push(`- [Agent card](${url(s.agentCard)}): A2A agent card listing skills and interfaces.`);
    if (lines.length === 0) {
        skipped.push({ path: "llms-additions.md", reason: "no API, MCP or agent card exists to list" });
    }
    else {
        files.push({
            path: "llms-additions.md",
            description: "Lines to paste into llms.txt so agents find each surface.",
            content: `<!-- ${header} -->\n\n## Agent interfaces\n\n${lines.join("\n")}\n`,
        });
    }
    // 4. CORS snippets for public read-only routes
    const discovery = [
        "/llms.txt",
        "/skill.md",
        ...OPENAPI_PATHS,
        ...AGENT_CARD_PATHS,
        API_CATALOG_PATH,
        "/.well-known/x402",
        "/.well-known/mcp.json",
    ].filter((p) => ok(bundle.responses[p]));
    const publicGets = openapiOperations(s.openapi?.doc ?? null)
        .filter((o) => o.method === "get" && Array.isArray(o.op.security) && o.op.security.length === 0 && !o.path.includes("{"))
        .map((o) => o.path);
    const routes = [...new Set([...discovery, ...publicGets])].sort();
    if (routes.length === 0) {
        skipped.push({ path: "cors/express.js", reason: "no public read-only route was found in the bundle" });
        skipped.push({ path: "cors/nginx.conf", reason: "no public read-only route was found in the bundle" });
    }
    else {
        files.push({
            path: "cors/express.js",
            description: `Express middleware allowing GET from any origin on ${routes.length} public read-only routes, no credentials.`,
            content: `// ${header}
// Public read-only routes only. Never add Access-Control-Allow-Credentials here.
const PUBLIC_READ_ONLY = new Set(${JSON.stringify(routes, null, 2).replace(/\n/g, "\n")});

function agentCors(req, res, next) {
  if (!PUBLIC_READ_ONLY.has(req.path)) return next();
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.set("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  next();
}

module.exports = { agentCors, PUBLIC_READ_ONLY };
`,
        });
        files.push({
            path: "cors/nginx.conf",
            description: "nginx location blocks with the same public read-only CORS policy.",
            content: `# ${header}
# Public read-only routes only. No Access-Control-Allow-Credentials.
${routes
                .map((r) => `location = ${r} {
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Accept, Content-Type" always;
    add_header Access-Control-Max-Age 86400 always;
    if ($request_method = OPTIONS) { return 204; }
    limit_except GET HEAD OPTIONS { deny all; }
    # keep your existing proxy_pass / try_files here
}`)
                .join("\n\n")}
`,
        });
    }
    // 5. MCP registry server.json
    if (!bundle.mcp?.url) {
        skipped.push({ path: "server.json", reason: "no MCP URL in the bundle" });
    }
    else if (!s.mcpUrl) {
        skipped.push({ path: "server.json", reason: "the MCP URL did not answer initialize, so it is not confirmed" });
    }
    else {
        const reverse = bundle.host.split(".").reverse().join(".");
        const short = String(s.mcpServerInfo?.name ?? "mcp").replace(/[^a-zA-Z0-9._-]/g, "-");
        files.push({
            path: "server.json",
            description: "Entry for the official MCP registry; add the current registry $schema before publishing.",
            content: jsonFile(header, {
                name: `${reverse}/${short}`,
                description: `TODO: one sentence on what the ${bundle.host} MCP server does.`,
                version: s.mcpServerInfo?.version ?? "0.1.0",
                remotes: [{ type: "streamable-http", url: s.mcpUrl }],
            }),
        });
    }
    // 6. MCP version-negotiation note
    if (!s.mcpUrl || !s.mcpVersion) {
        skipped.push({ path: "mcp-version-negotiation.md", reason: "no MCP initialize response in the bundle" });
    }
    else if (s.mcpVersion >= LATEST_MCP_VERSION || s.mcpVersion === bundle.mcp?.offeredVersion) {
        skipped.push({ path: "mcp-version-negotiation.md", reason: `server already negotiates ${s.mcpVersion}` });
    }
    else {
        files.push({
            path: "mcp-version-negotiation.md",
            description: `Why ${s.mcpVersion} is a problem and how to negotiate ${LATEST_MCP_VERSION}.`,
            content: `<!-- ${header} -->

# MCP version negotiation

The client offered protocolVersion \`${bundle.mcp?.offeredVersion}\` and ${s.mcpUrl} answered \`${s.mcpVersion}\`.

Per the MCP lifecycle rules, a server that supports the offered version must return it unchanged; it should only answer with a different version when it does not support the offered one. Answering an old version only means clients lose newer features such as structured tool output, tool annotations and elicitation.

## What to change

1. Upgrade the MCP SDK to a release that supports \`${LATEST_MCP_VERSION}\`.
2. In the initialize handler, echo the client's protocolVersion when it is in your supported list; otherwise return your latest supported version.
3. Keep \`${s.mcpVersion}\` in the supported list during the transition so old clients keep working.
4. Re-run the probe and confirm initialize returns \`${LATEST_MCP_VERSION}\`.
`,
        });
    }
    return { host: bundle.host, probedAt: bundle.probedAt, header, files, skipped };
}
export function fixPackReadme(pack) {
    return `<!-- ${pack.header} -->

# Agent Fix Pack for ${pack.host}

Ready-to-adapt files derived from the probe bundle taken ${pack.probedAt}. Nothing here points at an endpoint that is not in the bundle.

## Generated

${pack.files.map((f) => `- \`${f.path}\` - ${f.description}`).join("\n") || "- nothing"}

## Not generated

${pack.skipped.map((s) => `- \`${s.path}\` - not generated: ${s.reason}`).join("\n") || "- nothing skipped"}
`;
}
/** Single-file variant: README plus every file in a fenced block. */
export function fixPackMarkdown(pack) {
    const lang = (p) => (p.endsWith(".json") ? "json" : p.endsWith(".js") ? "js" : p.endsWith(".conf") ? "nginx" : "markdown");
    return `${fixPackReadme(pack)}\n${pack.files
        .map((f) => `## ${f.path}\n\n\`\`\`${lang(f.path)}\n${f.content}\`\`\`\n`)
        .join("\n")}`;
}
export async function fixPackZip(pack) {
    const entries = { "README.md": strToU8(fixPackReadme(pack)) };
    for (const f of pack.files)
        entries[f.path] = strToU8(f.content);
    return zipSync(entries, { level: 6 });
}
