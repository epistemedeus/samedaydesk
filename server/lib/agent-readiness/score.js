import { runChecks } from "./checks.js";
export const CATEGORY_WEIGHTS = [
    { id: "discovery", label: "Discovery files", weight: 14 },
    { id: "openapi", label: "OpenAPI", weight: 15 },
    { id: "mcp", label: "MCP", weight: 20 },
    { id: "agentCard", label: "Agent card (A2A)", weight: 10 },
    { id: "identity", label: "Cross-surface identity", weight: 10 },
    { id: "x402", label: "x402 payments", weight: 5 },
    { id: "cors", label: "CORS for browser agents", weight: 5 },
    { id: "apiCatalog", label: "RFC 9727 api-catalog", weight: 5 },
    { id: "usability", label: "Agent usability lint", weight: 14 },
    { id: "webmcp", label: "WebMCP (emerging, informational)", weight: 2 },
];
/**
 * pass = 1, warn = 0.5, fail = 0.
 * "not applicable" scores 0 but keeps its weight: a missing agent surface is a
 * real gap in agent readiness, so a site with no surfaces scores near zero.
 */
export function statusValue(status) {
    switch (status) {
        case "pass":
            return 1;
        case "warn":
            return 0.5;
        default:
            return 0;
    }
}
export function scoreCategories(checks) {
    return CATEGORY_WEIGHTS.map(({ id, label, weight }) => {
        const own = checks.filter((c) => c.category === id);
        const ratio = own.length
            ? own.reduce((sum, c) => sum + statusValue(c.status), 0) / own.length
            : 0;
        return { id, label, weight, ratio, points: ratio * weight, checks: own };
    });
}
export function totalScore(categories) {
    return Math.round(categories.reduce((sum, c) => sum + c.points, 0));
}
const SEVERITY = { fail: 0, na: 1, warn: 2, pass: 3 };
export function topFixes(checks, categories, limit = 3) {
    const weightOf = (id) => categories.find((c) => c.id === id)?.weight ?? 0;
    return checks
        .filter((c) => c.status !== "pass")
        .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] ||
        weightOf(b.category) - weightOf(a.category) ||
        a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((c) => ({ title: c.title, fix: c.fix, category: c.category }));
}
export function buildReport(bundle, generatedAt = new Date().toISOString()) {
    const { checks, identity } = runChecks(bundle);
    const categories = scoreCategories(checks);
    return {
        schema: "agent-readiness.report.v1",
        host: bundle.host,
        probedAt: bundle.probedAt,
        generatedAt,
        score: totalScore(categories),
        categories,
        checks,
        identity,
        topFixes: topFixes(checks, categories),
    };
}
export function compareReports(before, after) {
    const categoryDeltas = CATEGORY_WEIGHTS.map(({ id, label }) => {
        const b = before.categories.find((c) => c.id === id);
        const a = after.categories.find((c) => c.id === id);
        const bp = Math.round((b?.points ?? 0) * 10) / 10;
        const ap = Math.round((a?.points ?? 0) * 10) / 10;
        return { id, label, before: bp, after: ap, delta: Math.round((ap - bp) * 10) / 10 };
    });
    const ids = [...new Set([...before.checks.map((c) => c.id), ...after.checks.map((c) => c.id)])];
    const changed = ids
        .map((id) => {
        const b = before.checks.find((c) => c.id === id);
        const a = after.checks.find((c) => c.id === id);
        return {
            id,
            title: a?.title ?? b?.title ?? id,
            before: (b?.status ?? "absent"),
            after: (a?.status ?? "absent"),
        };
    })
        .filter((row) => row.before !== row.after);
    return {
        before,
        after,
        scoreDelta: after.score - before.score,
        categoryDeltas,
        changed,
    };
}
