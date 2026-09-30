import { AGENT_CARD_PATHS, OPENAPI_PATHS } from "./checks.js";
import { fixPackMarkdown, generateFixPack } from "./fixpack.js";
import { probeHost } from "./probe.js";
import { consumeClient } from "./rate-limit.js";
import { buildReport } from "./score.js";

function evidencePath(check, bundle) {
  if (check.id.startsWith("discovery.llms") || check.id.startsWith("webmcp")) return "/llms.txt";
  if (check.id === "discovery.skill") return "/skill.md";
  if (check.id === "discovery.robots") return "/robots.txt";
  if (check.id.startsWith("openapi") || check.id.startsWith("usability.openapi")) {
    return OPENAPI_PATHS.find((path) => bundle.responses[path]) || "/openapi.json";
  }
  if (check.id.startsWith("agentCard")) {
    return AGENT_CARD_PATHS.find((path) => bundle.responses[path]) || "/.well-known/agent-card.json";
  }
  if (check.id.startsWith("x402")) return "/.well-known/x402";
  if (check.id.startsWith("apiCatalog")) return "/.well-known/api-catalog";
  if (check.id.startsWith("cors") || check.id.startsWith("identity")) return "/llms.txt";
  return "/";
}

export function presentReport(report, bundle) {
  const origin = `https://${bundle.host}`;
  const evidence = Object.entries(bundle.responses).map(([path, res]) => ({
    path,
    url: `${origin}${path}`,
    status: res.status,
  }));
  if (bundle.mcp?.url) {
    evidence.push({
      path: "/mcp",
      url: bundle.mcp.url,
      status: bundle.mcp.initialize ? 200 : 0,
      kind: "mcp",
    });
  }
  for (const linked of bundle.linkedMcp || []) {
    evidence.push({
      path: "linked-mcp",
      url: linked.url,
      status: linked.initialize ? 200 : 0,
      kind: "linked-mcp",
    });
  }
  for (const [url, res] of Object.entries(bundle.linkedResponses || {})) {
    evidence.push({ path: "linked-document", url, status: res.status, kind: "linked-document" });
  }
  return {
    schema: report.schema,
    host: report.host,
    probedAt: report.probedAt,
    generatedAt: report.generatedAt,
    score: report.score,
    free: true,
    categories: report.categories.map((category) => ({
      id: category.id,
      label: category.label,
      weight: category.weight,
      ratio: category.ratio,
      points: category.points,
    })),
    checks: report.checks.map((check) => {
      const mcp = check.id.startsWith("mcp.") || check.id.startsWith("usability.mcp");
      const evidenceUrl = mcp ? (bundle.mcp?.url || `${origin}/mcp`) : `${origin}${evidencePath(check, bundle)}`;
      return {
        id: check.id,
        category: check.category,
        title: check.title,
        status: check.status,
        reason: check.reason,
        fix: check.fix,
        evidenceUrl,
      };
    }),
    topFixes: report.topFixes,
    identity: {
      operations: report.identity.operations,
      activeSurfaces: report.identity.activeSurfaces,
      mismatches: report.identity.mismatches,
    },
    evidence,
    wwwFallback: bundle.wwwFallback || null,
  };
}

export function formatAgentReadiness(payload) {
  const lines = [
    `Agent readiness for ${payload.host}`,
    `Score: ${payload.score}/100`,
    "",
  ];
  for (const check of payload.checks) {
    lines.push(`[${check.status}] ${check.title} - ${check.reason}`);
    if (check.evidenceUrl) lines.push(`  evidence: ${check.evidenceUrl}`);
  }
  lines.push("", "Top fixes:");
  payload.topFixes.forEach((fix, index) => {
    lines.push(`${index + 1}. ${fix.title}: ${fix.fix}`);
  });
  lines.push("", `JSON: https://samedaydesk.com/agent-readiness?host=${encodeURIComponent(payload.host)}&format=json`);
  return lines.join("\n");
}

export async function runAgentReadinessCheck(rawHost, options = {}) {
  if (options.clientKey) consumeClient(options.clientKey);
  const bundle = await (options.probeHost || probeHost)(rawHost, options.probeDeps);
  const report = buildReport(bundle);
  return {
    bundle,
    report,
    payload: presentReport(report, bundle),
    fixPack: fixPackMarkdown(generateFixPack(bundle)),
  };
}
