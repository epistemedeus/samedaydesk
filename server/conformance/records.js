import { readFileSync } from "node:fs";
import path from "node:path";
import { publicFacts } from "./privacy.js";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function hostFromOrigin(origin) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function githubRepo(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) return null;
  return { org: match[1], repo: match[2].replace(/\.git$/i, "") };
}

export function loadExistingProbeRecords(repoRoot) {
  const records = [];
  const crawlPath = path.join(repoRoot, "client/src/data/sellerConformanceCrawl.json");
  const crawl = readJson(crawlPath);
  const crawlHost = hostFromOrigin(crawl.routes?.[0]?.origin) || "agents.samedaydesk.com";
  records.push({
    kind: "x402",
    subject: { host: crawlHost },
    checkedAt: crawl.checkedAt || null,
    method: (crawl.sources || []).join("; "),
    source: "client/src/data/sellerConformanceCrawl.json",
    limitations: [...(crawl.limitations || [])],
    observations: (crawl.routes || []).map((route) => ({
      id: route.id,
      method: route.method,
      route: route.route,
      registryStatus: route.registryStatus || "unknown",
      lastVerified: route.lastVerified || crawl.checkedAt || null,
      unpaid402: route.unpaid402 || null,
      openapiPresent: route.openapiPresent,
      unpaid402OutputSchemaPresent: route.unpaid402OutputSchemaPresent,
      cdpBazaar: route.cdpBazaar ? { resource: route.cdpBazaar.resource, lastUpdated: route.cdpBazaar.lastUpdated } : null,
    })),
    meta: publicFacts({
      schemaVersion: crawl.schemaVersion,
      greenRouteCount: crawl.greenRouteCount,
      sources: crawl.sources,
    }),
  });

  const presenceDir = path.join(repoRoot, "fixtures/presence");
  const meta = readJson(path.join(presenceDir, "meta.json"));
  const registry = readJson(path.join(presenceDir, "listings/mcp-registry.json"));
  const initialize = readJson(path.join(presenceDir, "listings/mcp-initialize.json"));
  const server = registry.servers?.[0]?.server || {};
  const official = registry.servers?.[0]?._meta?.["io.modelcontextprotocol.registry/official"] || {};
  const repo = githubRepo(server.repository?.url) || { org: "epistemedeus", repo: "x402-url-extractor" };
  const initializeInfo = initialize.result?.serverInfo || {};
  const remoteUrl = server.remotes?.[0]?.url || (meta.origin ? `${meta.origin}/mcp` : null);
  const mcpHost = hostFromOrigin(remoteUrl) || hostFromOrigin(meta.origin);

  records.push({
    kind: "mcp",
    subject: { org: repo.org, repo: repo.repo, registryName: server.name || null, host: mcpHost },
    checkedAt: meta.capturedAt || official.updatedAt || null,
    method: meta.mode || "public-read",
    source: "fixtures/presence/listings/mcp-registry.json+mcp-initialize.json",
    limitations: [
      meta.notes,
      "Registry listing and initialize serverInfo are separate observations. A listing or HTTP success is not a conformance pass.",
      "These captures do not include Windows, macOS, or Linux pass rates or payment-receipt settlement.",
    ].filter(Boolean),
    observations: [
      {
        id: "mcp-registry-listing",
        method: "GET",
        registryName: server.name || null,
        registryVersion: server.version || null,
        registryStatus: official.status || "unknown",
        publishedAt: official.publishedAt || null,
        updatedAt: official.updatedAt || null,
        remoteUrl: remoteUrl || null,
        repositoryUrl: server.repository?.url || null,
      },
      {
        id: "mcp-initialize",
        method: "unpaid initialize",
        protocolVersion: initialize.result?.protocolVersion || null,
        serverName: initializeInfo.name || null,
        serverVersion: initializeInfo.version || null,
        jsonrpc: initialize.jsonrpc || null,
      },
    ],
    meta: publicFacts({
      capturedAt: meta.capturedAt,
      origin: meta.origin,
      files: meta.files,
      registryCount: registry.metadata?.count,
    }),
  });

  if (mcpHost) {
    records.push({
      kind: "x402",
      subject: { host: mcpHost },
      checkedAt: meta.capturedAt || null,
      method: "public-read GET of origin /.well-known/x402.json and related listings",
      source: "fixtures/presence/meta.json",
      limitations: [
        meta.notes,
        "Catalog capture of /.well-known/x402.json is not a payment-receipt or route-conformance pass.",
      ].filter(Boolean),
      observations: [
        {
          id: "presence-x402-catalog",
          method: "GET",
          route: "/.well-known/x402.json",
          registryStatus: "captured",
          catalogItems: 23,
        },
      ],
      meta: publicFacts({ capturedAt: meta.capturedAt, origin: meta.origin }),
    });
  }

  return records;
}

export function mcpSubjectKey(subject) {
  if (!subject?.org || !subject?.repo) return null;
  return `${String(subject.org).toLowerCase()}/${String(subject.repo).toLowerCase()}`;
}

export function x402SubjectKey(subject) {
  if (!subject?.host) return null;
  return String(subject.host).toLowerCase();
}
