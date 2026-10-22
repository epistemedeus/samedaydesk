// How llms.txt accounts for the API, MCP, and the agent card.
// Pass means every surface is target-valid: a link was declared and its target
// was fetched and is that kind of document, or a live target of that kind was
// fetched. A link whose target was not fetched is link-present and is not a pass.
// Declared absence is applicability evidence, and only when no live target exists.
import { looksLikeMcpUrl, resolveUrl } from "./discovery.js";
import { classifyRetrieval, isHtmlDocument } from "./retrieval.js";

const URL_RE = /(https?:\/\/[^\s)<>"'`\]]+|(?<![\w.:/])\/[^\s)<>"'`\]]*)/g;
const MCP_ABSENCE = [
  /\bthere is no mcp\b/i,
  /\bno mcp server\b/i,
  /\bno mcp endpoint\b/i,
  // Hostnames contain dots, so a sentence limit cannot be "[^.]*".
  // Stay on one line and cap the gap so "no ... MCP server ... advertised" still matches.
  /\bno\b[^\n]{0,240}\bmcp server\b[^\n]{0,240}\b(?:advertised|offered|published)\b/i,
];
const CARD_ABSENCE = [
  /\bno agent card\b/i,
  /\bno a2a agent\b/i,
  /\bno a2a\b[^.\n]{0,40}\b(?:endpoint|agent|card)\b/i,
  /\bno\b[^.\n]{0,80}\ba2a agent endpoint\b/i,
];

function tidy(raw) {
  return String(raw || "").trim().replace(/[.,;:]+$/, "");
}

function unique(values) {
  return [...new Set(values)];
}

function quoteLine(line) {
  const trimmed = line.trim().replaceAll('"', "'");
  if (trimmed.length <= 280) return trimmed;
  return `${trimmed.slice(0, 277)}...`;
}

function stripLinks(line) {
  return line.replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1");
}

function lineNegatesMcp(line) {
  return /\bnot an mcp\b/i.test(line)
    || /human documentation only/i.test(line)
    || /not an mcp protocol endpoint/i.test(line);
}

function firstQuote(body, patterns) {
  for (const rawLine of String(body || "").split(/\r?\n/)) {
    const line = stripLinks(rawLine).trim();
    if (!line) continue;
    if (patterns.some((pattern) => pattern.test(line))) return quoteLine(line);
  }
  return "";
}

function sameSite(urlHost, bundleHost) {
  const host = String(urlHost || "").toLowerCase();
  const origin = String(bundleHost || "").toLowerCase();
  return host === origin || host === `www.${origin}` || origin === `www.${host}`;
}

function lookupResponse(bundle, urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  const linked = bundle.linkedResponses || {};
  const direct = linked[urlString] || linked[urlString.replace(/\/$/, "")] || linked[url.toString()];
  if (!sameSite(url.hostname, bundle.host)) return direct || null;
  const path = url.pathname || "/";
  const alt = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : `${path}/`;
  return bundle.responses?.[path] || bundle.responses?.[alt] || direct || null;
}

function parsedBody(res) {
  if (!res || classifyRetrieval(res).kind !== "retrieved" || isHtmlDocument(res)) return undefined;
  try {
    return JSON.parse(String(res.body || ""));
  } catch {
    return undefined;
  }
}

function classifyKind(url) {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* keep the raw string */
  }
  if (looksLikeMcpUrl(url)) return "mcp";
  if (/agent-card\.json$/i.test(pathname) || /\/\.well-known\/agent\.json$/i.test(pathname)) return "agentCard";
  if (/openapi|swagger|api\.json/i.test(pathname) || /\/api\//i.test(pathname)) return "api";
  return "";
}

function collectLinks(body, host) {
  const api = [];
  const mcp = [];
  const agentCard = [];
  let mcpNegation = "";
  for (const rawLine of String(body || "").split(/\r?\n/)) {
    const stripped = stripLinks(rawLine);
    if (!mcpNegation && lineNegatesMcp(stripped)) mcpNegation = quoteLine(stripped);
    const negated = lineNegatesMcp(stripped);
    const key = /^\s*(?:[-*]\s*)?([a-z0-9-]+)\s*:\s*(\S+)/i.exec(stripped);
    if (key?.[1]?.toLowerCase() === "mcp-endpoint") {
      if (!negated) {
        const endpoint = resolveUrl(tidy(key[2]), host);
        if (endpoint) mcp.push(endpoint);
      }
      continue;
    }
    for (const match of rawLine.matchAll(URL_RE)) {
      const url = resolveUrl(tidy(match[1]), host);
      if (!url) continue;
      const kind = classifyKind(url);
      if (kind === "mcp") {
        if (!negated) mcp.push(url);
      } else if (kind === "agentCard") {
        agentCard.push(url);
      } else if (kind === "api") {
        api.push(url);
      }
    }
  }
  return { api: unique(api), mcp: unique(mcp), agentCard: unique(agentCard), mcpNegation };
}

function apiTargetValid(res) {
  const doc = parsedBody(res);
  if (!doc || typeof doc !== "object") return false;
  if (!Array.isArray(doc) && (typeof doc.openapi === "string" || typeof doc.swagger === "string")) return true;
  return Array.isArray(doc) || typeof doc === "object";
}

function isApiUrl(url) {
  return classifyKind(url) === "api";
}

function bodyLooksLikeMcp(res) {
  if (!res || classifyRetrieval(res).kind !== "retrieved" || isHtmlDocument(res)) return false;
  const body = String(res.body || "");
  try {
    const doc = JSON.parse(body);
    if (doc && typeof doc === "object" && (doc.jsonrpc || doc.mcpServers || doc.result)) return true;
  } catch {
    /* a non-JSON MCP advertisement can still be explicit */
  }
  return /jsonrpc|"mcpServers"|streamable http mcp/i.test(body);
}

function handshakeUrls(bundle) {
  const urls = [];
  const own = bundle.mcp?.initialize?.result;
  if (own && typeof own === "object") urls.push(bundle.mcp.url);
  for (const linked of bundle.linkedMcp || []) {
    const result = linked?.initialize?.result;
    if (result && typeof result === "object" && linked.url) urls.push(linked.url);
  }
  return urls;
}

function urlsMatch(left, right) {
  return String(left || "").replace(/\/$/, "") === String(right || "").replace(/\/$/, "");
}

function cardValid(res) {
  const doc = parsedBody(res);
  return !!doc
    && !Array.isArray(doc)
    && typeof doc.name === "string"
    && doc.name.trim()
    && typeof doc.description === "string"
    && doc.description.trim();
}

function judgeLinks(bundle, links, validFn) {
  let valid = "";
  let invalid = "";
  for (const link of links) {
    const res = lookupResponse(bundle, link);
    if (validFn(res, link)) {
      if (!valid) valid = link;
      continue;
    }
    if (res && !invalid) invalid = link;
  }
  return { valid, invalid };
}

function probedApi(bundle) {
  for (const path of ["/openapi.json", "/.well-known/openapi.json"]) {
    const res = bundle.responses?.[path];
    const url = `https://${bundle.host}${path}`;
    if (res && isApiUrl(url) && apiTargetValid(res)) return url;
  }
  return "";
}

function probedCard(bundle) {
  for (const path of ["/.well-known/agent-card.json", "/.well-known/agent.json"]) {
    if (cardValid(bundle.responses?.[path])) return `https://${bundle.host}${path}`;
  }
  return "";
}

function mcpValidTarget(bundle, links, hands) {
  for (const link of links) {
    if (hands.some((url) => urlsMatch(url, link))) return link;
    if (bodyLooksLikeMcp(lookupResponse(bundle, link))) return link;
  }
  const own = `https://${bundle.host}/mcp`;
  if (hands.some((url) => urlsMatch(url, own))) return own;
  return "";
}

function rollup(links, valid, invalid, quote) {
  if (valid) return { state: "target-valid", target: valid, links, quote: quote || "" };
  if (invalid) return { state: "target-invalid", target: invalid, links, quote: quote || "" };
  if (links.length) return { state: "link-present", target: links[0], links, quote: quote || "" };
  if (quote) return { state: "declared-absent", target: "", links, quote };
  return { state: "missing", target: "", links, quote: "" };
}

function linkageStatus(surfaces) {
  const states = surfaces.map((surface) => surface.state);
  if (states.every((state) => state === "target-valid")) return "pass";
  if (states.every((state) => state === "declared-absent")) return "na";
  if (states.every((state) => state === "missing" || state === "target-invalid")) return "fail";
  return "warn";
}

function phrase(name, surface) {
  if (surface.state === "target-valid") return `${name} target is valid`;
  if (surface.state === "target-invalid") return `${name} link is present but the target is not that kind`;
  if (surface.state === "link-present") return `${name} link is present but the target was not verified`;
  if (surface.state === "declared-absent") {
    return `${name} not applicable: declared absent ("${surface.quote}")`;
  }
  return `${name} link is absent`;
}

function publishFix(api, mcp, agentCard) {
  const needed = [];
  if (api.state === "missing" || api.state === "target-invalid") needed.push("the OpenAPI document");
  if (mcp.state === "missing" || mcp.state === "target-invalid") needed.push("an MCP endpoint");
  if (agentCard.state === "missing" || agentCard.state === "target-invalid") needed.push("an agent card");
  if (!needed.length) {
    return "No publish action: llms.txt already accounts for each surface, including any it declares absent.";
  }
  return `Add a link whose target is valid for ${needed.join(", ")}.`;
}

/** Classify API, MCP, and agent-card linkage inside one llms.txt body. */
export function assessLlmsLinkage(body, bundle) {
  const found = collectLinks(body, bundle.host);
  const mcpQuote = firstQuote(body, MCP_ABSENCE);
  const cardQuote = firstQuote(body, CARD_ABSENCE);
  const hands = handshakeUrls(bundle);
  const apiJudge = judgeLinks(bundle, found.api, (res, link) => isApiUrl(link) && apiTargetValid(res));
  const cardJudge = judgeLinks(bundle, found.agentCard, (res) => cardValid(res));
  const api = rollup(found.api, apiJudge.valid || probedApi(bundle), apiJudge.invalid, "");
  const mcp = rollup(found.mcp, mcpValidTarget(bundle, found.mcp, hands), mcpInvalid(bundle, found.mcp, hands), mcpQuote);
  const agentCard = rollup(found.agentCard, cardJudge.valid || probedCard(bundle), cardJudge.invalid, cardQuote);
  const status = linkageStatus([api, mcp, agentCard]);
  const reasonParts = [
    "Pass means every surface is target-valid.",
    phrase("API", api),
    phrase("MCP", mcp),
    phrase("Agent card", agentCard),
  ];
  if (found.mcpNegation) reasonParts.push(`Negated MCP link: "${found.mcpNegation}"`);
  return {
    status,
    reason: `${reasonParts.join(" ")}`,
    fix: publishFix(api, mcp, agentCard),
    linkage: { passMeans: "target-valid", api, mcp, agentCard },
  };
}

function mcpInvalid(bundle, links, hands) {
  for (const link of links) {
    if (hands.some((url) => urlsMatch(url, link))) continue;
    const res = lookupResponse(bundle, link);
    if (!res) continue;
    if (bodyLooksLikeMcp(res)) continue;
    return link;
  }
  return "";
}
