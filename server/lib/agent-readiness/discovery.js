const URL_RE = /(https?:\/\/[^\s)<>"'`\]]+|(?<![\w.:/])\/[^\s)<>"'`\]]*)/g;
const MCP_PATH_RE = /\/[\w.-]*mcp\/?$/i;
const WEBMCP_RE = /\b(navigator|document)\.modelContext\b/;
function isOk(res) {
    return !!res && res.status >= 200 && res.status < 300 && !!res.body;
}
function tidy(raw) {
    return raw.trim().replace(/[.,;:]+$/, "");
}
export function resolveUrl(raw, host) {
    const value = tidy(raw);
    try {
        return new URL(value, `https://${host}/`).toString();
    }
    catch {
        return null;
    }
}
/** True when a URL points at an MCP endpoint by path: /mcp, /mcp/, /foo-mcp/. */
export function looksLikeMcpUrl(url) {
    try {
        return MCP_PATH_RE.test(new URL(url).pathname);
    }
    catch {
        return MCP_PATH_RE.test(url);
    }
}
class LinkSet {
    host;
    map = new Map();
    constructor(host) {
        this.host = host;
    }
    add(raw, kind, source) {
        const url = resolveUrl(raw, this.host);
        if (!url)
            return;
        const existing = this.map.get(url);
        if (existing) {
            if (!existing.sources.includes(source))
                existing.sources.push(source);
            if (kind === "endpoint")
                existing.kind = "endpoint";
            return;
        }
        this.map.set(url, { url, kind, sources: [source] });
    }
    list() {
        return [...this.map.values()];
    }
}
/** Keys and plain links an llms.txt can use to point at MCP surfaces. */
export function parseLlmsTxt(text, host) {
    const set = new LinkSet(host);
    const webmcp = [];
    for (const line of text.split(/\r?\n/)) {
        const key = /^\s*(?:[-*]\s*)?([a-z0-9-]+)\s*:\s*(\S+)/i.exec(line);
        const keyName = key?.[1]?.toLowerCase();
        if (keyName === "mcp-endpoint" || keyName === "mcp-catalog-json" || keyName === "webmcp-api") {
            const name = keyName;
            const value = key[2];
            if (name === "mcp-endpoint")
                set.add(value, "endpoint", "llms.txt mcp-endpoint");
            else if (name === "mcp-catalog-json")
                set.add(value, "catalog", "llms.txt mcp-catalog-json");
            else
                webmcp.push(`llms.txt webmcp-api: ${tidy(value)}`);
            continue;
        }
        for (const m of line.matchAll(URL_RE)) {
            const raw = tidy(m[1]);
            if (looksLikeMcpUrl(raw))
                set.add(raw, "endpoint", "llms.txt link");
        }
        if (!/webmcp-api/i.test(line)) {
            const w = WEBMCP_RE.exec(line);
            if (w)
                webmcp.push(`llms.txt mentions ${w[0]}`);
        }
    }
    return { links: set.list(), webmcp };
}
function collectUrls(value, out) {
    if (typeof value === "string") {
        if (/^https?:\/\//.test(value) || value.startsWith("/"))
            out.push(value);
    }
    else if (Array.isArray(value)) {
        for (const v of value)
            collectUrls(v, out);
    }
    else if (value && typeof value === "object") {
        for (const v of Object.values(value))
            collectUrls(v, out);
    }
}
function parseJson(res) {
    if (!isOk(res))
        return null;
    try {
        return JSON.parse(res.body);
    }
    catch {
        return null;
    }
}
/**
 * Every MCP endpoint the site links from its own discovery files: llms.txt,
 * any fetched MCP catalog, the RFC 9727 api-catalog and the agent card
 * interfaces. The site's own /mcp is not listed unless a file links it.
 */
export function discoverMcpLinks(bundle) {
    const set = new LinkSet(bundle.host);
    const llms = bundle.responses["/llms.txt"];
    const catalogs = [];
    if (isOk(llms)) {
        for (const link of parseLlmsTxt(llms.body, bundle.host).links) {
            for (const s of link.sources)
                set.add(link.url, link.kind, s);
            if (link.kind === "catalog")
                catalogs.push(link);
        }
    }
    for (const cat of catalogs) {
        const urls = [];
        collectUrls(parseJson(bundle.linkedResponses?.[cat.url]), urls);
        for (const u of urls)
            if (looksLikeMcpUrl(u))
                set.add(u, "endpoint", "MCP catalog JSON");
    }
    const apiCatalog = parseJson(bundle.responses["/.well-known/api-catalog"]);
    if (apiCatalog && Array.isArray(apiCatalog.linkset)) {
        const urls = [];
        collectUrls(apiCatalog.linkset, urls);
        for (const u of urls)
            if (looksLikeMcpUrl(u))
                set.add(u, "endpoint", "api-catalog linkset");
    }
    const card = (parseJson(bundle.responses["/.well-known/agent-card.json"]) ??
        parseJson(bundle.responses["/.well-known/agent.json"]));
    if (card) {
        const ifaces = [
            ...(Array.isArray(card["interfaces"]) ? card["interfaces"] : []),
            ...(Array.isArray(card["additionalInterfaces"]) ? card["additionalInterfaces"] : []),
        ];
        for (const i of ifaces) {
            const o = (i ?? {});
            const url = typeof o["url"] === "string" ? o["url"] : "";
            const transport = String(o["transport"] ?? o["protocolBinding"] ?? o["protocol"] ?? "");
            if (url && (looksLikeMcpUrl(url) || /mcp/i.test(transport))) {
                set.add(url, "endpoint", "agent-card interfaces");
            }
        }
    }
    return set.list();
}
/** Sources that declare a WebMCP (navigator/document.modelContext) surface. */
export function detectWebMcp(bundle) {
    const found = [];
    const llms = bundle.responses["/llms.txt"];
    if (isOk(llms))
        found.push(...parseLlmsTxt(llms.body, bundle.host).webmcp);
    for (const [path, res] of Object.entries(bundle.responses)) {
        if (path === "/llms.txt" || !isOk(res))
            continue;
        const ct = res.contentType ?? "";
        if (path !== "/" && !/html/i.test(ct))
            continue;
        const w = WEBMCP_RE.exec(res.body);
        if (w)
            found.push(`page ${path} uses ${w[0]}`);
    }
    return [...new Set(found)];
}
/** Apex answered with a redirect, nothing, or an empty body: try www. */
export function needsWwwFallback(host, root) {
    if (host.startsWith("www."))
        return false;
    if (!root || root.status === 0)
        return true;
    if (root.status >= 300 && root.status < 400)
        return true;
    return root.status >= 200 && root.status < 300 && !(root.body ?? "").trim();
}
function answered(m) {
    const r = m?.initialize?.result;
    return !!r && typeof r === "object";
}
/**
 * The MCP server the checks should score: the host's own /mcp when it answers,
 * otherwise the first answering server linked from the site's discovery files.
 */
export function resolveMcp(bundle) {
    if (answered(bundle.mcp))
        return bundle.mcp;
    return bundle.linkedMcp?.find(answered) ?? bundle.mcp;
}
