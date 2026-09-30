/**
 * REAL benchmark results, probed 2026-09-24 11:50Z. These are recorded
 * observations, not synthetic DEMO bundles, and are kept separate from them.
 */
export const BENCHMARK_LABEL = "real, probed 2026-09-24 11:50Z";
export const BENCHMARK_PROBED_AT = "2026-09-24T11:50:00Z";
export const BENCHMARK_SURFACES = [
    { id: "llms", label: "llms.txt", points: 10 },
    { id: "skill", label: "skill.md", points: 5 },
    { id: "openapi", label: "OpenAPI", points: 20 },
    { id: "mcp", label: "MCP", points: 25 },
    { id: "agentCard", label: "Agent card", points: 10 },
    { id: "apiCatalog", label: "api-catalog", points: 10 },
    { id: "x402", label: "x402", points: 10 },
    { id: "cors", label: "CORS", points: 5 },
    { id: "webmcp", label: "WebMCP", points: 5 },
];
/** Ordered from least to most an agent can do. */
export const AGENT_ACTIONS = [
    "nothing",
    "read or search info",
    "assess or prepare with a human claim",
    "pay per call",
];
const none = {
    llms: "no",
    skill: "no",
    openapi: "no",
    mcp: "no",
    agentCard: "no",
    apiCatalog: "no",
    x402: "no",
    cors: "no",
    webmcp: "no",
};
const llmsOnly = (host, notes = []) => ({
    host,
    group: "US LLC formation services",
    formation: true,
    surfaces: { ...none, llms: "yes" },
    action: "nothing",
    notes: ["llms.txt only; no callable surface.", ...notes],
});
export const BENCHMARK_SITES = [
    {
        host: "ein.llc",
        group: "Our sites",
        formation: true,
        surfaces: { ...none, llms: "yes", skill: "yes", openapi: "yes" },
        action: "assess or prepare with a human claim",
        notes: ["OpenAPI with 9 operations.", "MCP planned, not live (404)."],
    },
    {
        host: "legalzoom.com",
        group: "US LLC formation services",
        formation: true,
        surfaces: { ...none, llms: "yes", mcp: "yes", webmcp: "yes" },
        action: "read or search info",
        notes: [
            "llms.txt links an MCP at https://www.legalzoom.com/mcp and an MCP catalog JSON.",
            "MCP protocol 2025-11-25, 4 read-only tools with annotations: search-legalzoom-articles, search-legalzoom-product-urls, legalzoom-all-product-descriptions, get_help.",
            "Server instructions: information and education only; it cannot form businesses.",
            "Declares WebMCP (document.modelContext).",
        ],
    },
    llmsOnly("doola.com"),
    llmsOnly("stripe.com", ["Stripe Atlas."]),
    llmsOnly("bizee.com"),
    llmsOnly("zenbusiness.com"),
    {
        host: "firstbase.io",
        group: "US LLC formation services",
        formation: true,
        surfaces: { ...none },
        action: "nothing",
        notes: ["robots.txt only."],
    },
    {
        host: "clerky.com",
        group: "US LLC formation services",
        formation: true,
        surfaces: { ...none },
        action: "nothing",
        notes: ["robots.txt only."],
    },
    {
        host: "northwestregisteredagent.com",
        group: "US LLC formation services",
        formation: true,
        surfaces: { ...none },
        action: "nothing",
        notes: ["Returned nothing."],
    },
    {
        host: "samedaydesk.com",
        group: "Our sites",
        formation: false,
        surfaces: { ...none, llms: "yes", agentCard: "yes", mcp: "partial", cors: "partial" },
        action: "read or search info",
        notes: ["MCP with 5 tools, old protocol 2024-11-05.", "CORS on 1 route."],
    },
    {
        host: "agents.samedaydesk.com",
        group: "Our sites",
        formation: false,
        surfaces: {
            ...none,
            llms: "yes",
            skill: "yes",
            openapi: "yes",
            agentCard: "yes",
            x402: "yes",
            mcp: "yes",
        },
        action: "pay per call",
        notes: ["MCP 2025-11-25 with 25 tools.", "No CORS."],
    },
    {
        host: "neomorphic.io",
        group: "Our sites",
        formation: false,
        surfaces: {
            ...none,
            llms: "yes",
            skill: "yes",
            openapi: "yes",
            x402: "yes",
            cors: "yes",
            mcp: "unknown",
        },
        action: "read or search info",
        notes: ["MCP links point to /mcp/ and /labs/correspondence-mcp/; not probed yet."],
    },
];
/** yes = full points, partial = half, no and unknown = 0 (unknown is never a pass). */
export function stateValue(state) {
    return state === "yes" ? 1 : state === "partial" ? 0.5 : 0;
}
export function surfacePoints(site) {
    return BENCHMARK_SURFACES.reduce((sum, s) => sum + s.points * stateValue(site.surfaces[s.id]), 0);
}
/** Rank by surface points, then by what an agent can do, then by host. */
export function rankBenchmark(sites = BENCHMARK_SITES) {
    return sites
        .map((s) => ({ ...s, points: surfacePoints(s), rank: 0 }))
        .sort((a, b) => b.points - a.points ||
        AGENT_ACTIONS.indexOf(b.action) - AGENT_ACTIONS.indexOf(a.action) ||
        a.host.localeCompare(b.host))
        .map((s, i) => ({ ...s, rank: i + 1 }));
}
/** Factual findings derived from the data, not hand-written. */
export function benchmarkFindings(sites = BENCHMARK_SITES) {
    const competitors = sites.filter((s) => s.formation && s.group === "US LLC formation services");
    const formation = sites.filter((s) => s.formation);
    return {
        competitorsWithMcp: competitors.filter((s) => s.surfaces.mcp === "yes").map((s) => s.host),
        formationWithAssessApi: formation
            .filter((s) => s.surfaces.openapi === "yes" && s.action === "assess or prepare with a human claim")
            .map((s) => s.host),
        competitorCount: competitors.length,
    };
}
