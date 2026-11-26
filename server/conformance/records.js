import { readFileSync } from "node:fs";
import path from "node:path";
import { publicFacts } from "./privacy.js";
import { githubRepoFromUrl, isMcpSubject, isX402Host, publicHostFromOrigin } from "./subjects.js";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function mcpSubjectKey(subject) {
  if (!subject?.org || !subject?.repo) return null;
  return `${String(subject.org).toLowerCase()}/${String(subject.repo).toLowerCase()}`;
}

export function x402SubjectKey(subject) {
  if (!subject?.host) return null;
  return String(subject.host).toLowerCase();
}

export function loadExistingProbeRecords(repoRoot) {
  const records = [];
  const crawlPath = path.join(repoRoot, "client/src/data/sellerConformanceCrawl.json");
  const crawl = readJson(crawlPath);
  const crawlHost = publicHostFromOrigin(crawl.routes?.[0]?.origin);
  if (crawlHost) {
    const crawlPaths = [...new Set((crawl.sources || []).map((source) => {
      try {
        return new URL(source).pathname;
      } catch {
        return null;
      }
    }).filter(Boolean))];
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
        wellKnownPaths: crawlPaths,
      }),
    });
  }

  const presenceDir = path.join(repoRoot, "fixtures/presence");
  const meta = readJson(path.join(presenceDir, "meta.json"));
  const registry = readJson(path.join(presenceDir, "listings/mcp-registry.json"));
  const initialize = readJson(path.join(presenceDir, "listings/mcp-initialize.json"));
  const server = registry.servers?.[0]?.server || {};
  const official = registry.servers?.[0]?._meta?.["io.modelcontextprotocol.registry/official"] || {};
  const repo = githubRepoFromUrl(server.repository?.url);
  const initializeInfo = initialize.result?.serverInfo || {};
  const remoteUrl = server.remotes?.[0]?.url || (meta.origin ? `${meta.origin}/mcp` : null);
  const mcpHost = publicHostFromOrigin(remoteUrl) || publicHostFromOrigin(meta.origin);
  const registrySchema = server.$schema || registry.$schema || null;
  const protocolVersion = initialize.result?.protocolVersion || null;

  if (repo && isMcpSubject(repo.org, repo.repo)) {
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
          registrySchema: registrySchema || null,
          registryStatus: official.status || "unknown",
          publishedAt: official.publishedAt || null,
          updatedAt: official.updatedAt || null,
          remoteUrl: remoteUrl || null,
          repositoryUrl: server.repository?.url || null,
        },
        {
          id: "mcp-initialize",
          method: "unpaid initialize",
          protocolVersion,
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
        registrySchema,
      }),
    });
  }

  const catalogPath = path.join(presenceDir, "catalog/x402.json");
  let catalog = null;
  try {
    catalog = readJson(catalogPath);
  } catch {
    catalog = null;
  }
  const presenceHost = publicHostFromOrigin(meta.origin) || mcpHost;
  if (presenceHost && isX402Host(presenceHost) && catalog && typeof catalog === "object") {
    const metaPathNote = typeof meta.files?.["catalog/x402.json"] === "string" ? meta.files["catalog/x402.json"] : "";
    const presencePath = metaPathNote.includes("/.well-known/x402.json")
      ? "/.well-known/x402.json"
      : metaPathNote.includes("/.well-known/x402")
        ? "/.well-known/x402"
        : "/.well-known/x402.json";
    const itemCount = Array.isArray(catalog.items) ? catalog.items.length : null;
    records.push({
      kind: "x402",
      subject: { host: presenceHost },
      checkedAt: meta.capturedAt || null,
      method: "public-read GET of a well-known x402 catalog and related listings",
      source: "fixtures/presence/catalog/x402.json",
      limitations: [
        meta.notes,
        "Catalog capture of a well-known x402 document is not a payment-receipt or route-conformance pass.",
        "First-party records disagree on the well-known path (/.well-known/x402.json in the presence catalog capture vs /.well-known/x402 in the seller crawl). Both spellings are recorded; they were not equated.",
      ].filter(Boolean),
      observations: [
        {
          id: "presence-x402-catalog",
          method: "GET",
          route: presencePath,
          registryStatus: "captured",
          x402Version: catalog.x402Version ?? null,
          catalogItems: itemCount,
          lastUpdated: catalog.lastUpdated ?? null,
        },
      ],
      meta: publicFacts({
        capturedAt: meta.capturedAt,
        origin: meta.origin,
        x402Version: catalog.x402Version ?? null,
        wellKnownPaths: [presencePath],
      }),
    });
  }

  return records;
}
