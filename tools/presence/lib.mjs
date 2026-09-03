import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FIXTURE_DIR,
  DEFAULT_ORIGIN,
  catalogByPath,
  hostOf,
  loadJsonFile,
  mcpUrl,
  mergeSellerCatalog,
  openApiUrl,
  pathOf,
  x402Url,
} from "./catalog.mjs";

export { DEFAULT_FIXTURE_DIR, DEFAULT_ORIGIN, mergeSellerCatalog };

export const SURFACES = Object.freeze(["bazaar", "mpp", "agentverse", "mcp-registry"]);

export const BAZAAR_MERCHANT_PATH = "/platform/v2/x402/discovery/merchant";
export const BAZAAR_WRITE_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";
export const BAZAAR_API_ORIGIN = "https://api.cdp.coinbase.com";
export const MPP_CATALOG_URL = "https://mpp.dev/api/services";
export const MPP_WRITE_URL = "https://mpp.dev/api/services";
export const MCP_REGISTRY_SEARCH =
  "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.epistemedeus%2Fx402-data-gateway&version=latest";
export const MCP_REGISTRY_PUBLISH = "https://registry.modelcontextprotocol.io/v0.1/publish";
export const AGENTVERSE_SEARCH_URL = "https://agentverse.ai/v1/search/agents";
export const MCP_SERVER_NAME = "io.github.epistemedeus/x402-data-gateway";

export const PROTECTED_KINDS = Object.freeze(["price", "payTo", "asset", "network", "facilitator"]);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function fixturePath(dir = DEFAULT_FIXTURE_DIR, rel) {
  return join(dir, rel);
}

export function loadFixturePack(dir = DEFAULT_FIXTURE_DIR) {
  return {
    dir,
    meta: loadJsonFile(fixturePath(dir, "meta.json")),
    openapi: loadJsonFile(fixturePath(dir, "catalog/openapi.json")),
    x402: loadJsonFile(fixturePath(dir, "catalog/x402.json")),
    bazaar: loadJsonFile(fixturePath(dir, "listings/bazaar-merchant.json")),
    mpp: loadJsonFile(fixturePath(dir, "listings/mpp-services.json")),
    mcpRegistry: loadJsonFile(fixturePath(dir, "listings/mcp-registry.json")),
    mcpInitialize: loadJsonFile(fixturePath(dir, "listings/mcp-initialize.json")),
    agentverse: loadJsonFile(fixturePath(dir, "listings/agentverse-search.json")),
  };
}

export function protectedKind(fieldPath) {
  const parts = String(fieldPath).split(/[./\[\]]/).filter(Boolean);
  for (const part of parts) {
    const n = part.toLowerCase().replace(/[_-]/g, "");
    if (n === "price" || n === "priceusd" || n === "priceatomic" || n === "pricehint" || n === "amount") {
      return "price";
    }
    if (n === "payto" || n === "recipient") return "payTo";
    if (n === "asset" || n === "currency") return "asset";
    if (n === "network") return "network";
    if (n.startsWith("facilitator")) return "facilitator";
  }
  return null;
}

export function collectProtectedWrites(value, path = "", into = []) {
  if (value == null) return into;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectProtectedWrites(item, path ? `${path}.${index}` : String(index), into));
    return into;
  }
  if (typeof value !== "object") return into;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    const kind = protectedKind(key);
    if (kind) into.push({ field: next, kind, value: child });
    collectProtectedWrites(child, next, into);
  }
  return into;
}

export function diffTouchesProtected(diff) {
  const hits = [];
  for (const row of diff || []) {
    const kind = protectedKind(row.field);
    if (kind) hits.push({ ...row, kind });
  }
  return hits;
}

export function requestsTouchProtected(requests) {
  const hits = [];
  for (const request of requests || []) {
    for (const hit of collectProtectedWrites(request.body)) {
      hits.push({ url: request.url, method: request.method, ...hit });
    }
  }
  return hits;
}

export function applyDecision(diff, requests) {
  const fromDiff = diffTouchesProtected(diff);
  const fromBody = requestsTouchProtected(requests);
  const hits = [...fromDiff, ...fromBody];
  if (hits.length === 0) {
    return { allowed: true, reason: null, protectedHits: [] };
  }
  const kinds = uniqueKinds(hits);
  return {
    allowed: false,
    reason: `--apply refused: request would write protected field(s) ${kinds.join(", ")}`,
    protectedHits: hits,
  };
}

function uniqueKinds(hits) {
  return [...new Set(hits.map((hit) => hit.kind).filter(Boolean))];
}

export function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function listingMethod(resource) {
  return (
    resource?.extensions?.bazaar?.info?.input?.method ||
    resource?.request?.method ||
    "GET"
  );
}

export function bazaarMerchantUrl(payTo) {
  const url = new URL(BAZAAR_MERCHANT_PATH, `${BAZAAR_API_ORIGIN}/`);
  url.searchParams.set("payTo", payTo);
  url.searchParams.set("limit", "100");
  return url.href;
}

export function agentverseStatusUrl(address) {
  return `https://agentverse.ai/v1/almanac/agents/${address}/status`;
}

export function parseJsonBody(body) {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  const text = typeof body === "string" ? body : body == null ? "" : String(body);
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("event:") || trimmed.includes("\ndata:")) {
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("data:")) return JSON.parse(line.slice(5).trim());
    }
  }
  return JSON.parse(trimmed);
}

export async function liveFetch(url, options = {}) {
  const { timeoutMs = 20000, userAgent = "samedaydesk-presence-refresh/1.0", ...rest } = options;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "error",
      signal: ac.signal,
      ...rest,
      headers: {
        accept: "application/json, text/event-stream",
        "user-agent": userAgent,
        ...(rest.headers || {}),
      },
    });
    return {
      status: res.status,
      ok: res.ok,
      url: res.url,
      body: await res.text(),
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      url,
      body: "",
      error: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function fixtureRecord(pack, url, method) {
  const parsed = new URL(url, DEFAULT_ORIGIN);
  const host = parsed.host;
  const path = parsed.pathname;
  const upper = String(method || "GET").toUpperCase();

  if (path.endsWith("/openapi.json")) return pack.openapi;
  if (path.endsWith("/.well-known/x402.json") || path.endsWith("/x402.json")) return pack.x402;
  if (host === "api.cdp.coinbase.com" && path.includes("/x402/discovery/merchant")) return pack.bazaar;
  if (host === "mpp.dev" && path === "/api/services" && upper === "GET") return pack.mpp;
  if (host === "registry.modelcontextprotocol.io" && path.endsWith("/servers") && upper === "GET") {
    return pack.mcpRegistry;
  }
  if (path === "/mcp" || path.endsWith("/mcp")) return pack.mcpInitialize;
  if (host === "agentverse.ai" && path === "/v1/search/agents") return pack.agentverse;
  return null;
}

export function isWriteRequest(url, method) {
  const upper = String(method || "GET").toUpperCase();
  if (!WRITE_METHODS.has(upper)) return false;
  try {
    const parsed = new URL(url, DEFAULT_ORIGIN);
    if (parsed.pathname === "/mcp" || parsed.pathname.endsWith("/mcp")) return false;
    if (parsed.host === "agentverse.ai" && parsed.pathname === "/v1/search/agents") return false;
    return true;
  } catch {
    return true;
  }
}

export function createFixtureFetch(pack, { writes = [] } = {}) {
  return async (url, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    if (isWriteRequest(url, method)) {
      writes.push({
        method,
        url,
        headers: options.headers || {},
        body: options.body ? parseJsonBody(options.body) : null,
      });
      return {
        status: 200,
        ok: true,
        url,
        body: JSON.stringify({ ok: true, fixture: "write-not-sent" }),
      };
    }
    const record = fixtureRecord(pack, url, method);
    if (!record) {
      return { status: 0, ok: false, url, body: "", error: `fixture_miss:${url}` };
    }
    return {
      status: 200,
      ok: true,
      url,
      body: JSON.stringify(record),
    };
  };
}

async function readJson(fetchImpl, url, options = {}) {
  const rec = await fetchImpl(url, options);
  if (rec.error) throw new Error(`${url}: ${rec.error}`);
  if (!rec.ok) throw new Error(`${url}: HTTP ${rec.status}: ${String(rec.body).slice(0, 200)}`);
  return parseJsonBody(rec.body);
}

export async function loadSellerCatalog(fetchImpl, origin = DEFAULT_ORIGIN) {
  const openapi = await readJson(fetchImpl, openApiUrl(origin));
  const manifest = await readJson(fetchImpl, x402Url(origin));
  return mergeSellerCatalog(openapi, manifest);
}

function acceptOf(resource) {
  return Array.isArray(resource?.accepts) && resource.accepts[0] ? resource.accepts[0] : {};
}

function pushDiff(diff, row) {
  diff.push(row);
}

function comparePayment(listedAccept, catalogRoute, resourceUrl, diff) {
  const pairs = [
    ["amount", listedAccept.amount, catalogRoute.amount],
    ["asset", listedAccept.asset, catalogRoute.asset],
    ["network", listedAccept.network, catalogRoute.network],
    ["payTo", listedAccept.payTo, catalogRoute.payTo],
    ["scheme", listedAccept.scheme, catalogRoute.scheme],
    ["facilitator", listedAccept.facilitator ?? listedAccept.extra?.facilitator ?? null, catalogRoute.facilitator],
  ];
  for (const [field, listed, catalog] of pairs) {
    if (listed == null && catalog == null) continue;
    if (String(listed ?? "") !== String(catalog ?? "")) {
      pushDiff(diff, { resource: resourceUrl, field, listed: listed ?? null, catalog: catalog ?? null });
    }
  }
}

export function diffBazaar(catalog, listing) {
  const byPath = catalogByPath(catalog);
  const resources = listing?.resources || [];
  const listedCanonical = new Set();
  const records = [];
  const diff = [];

  for (const resource of resources) {
    const url = resource.resource;
    const path = pathOf(url);
    const host = hostOf(url);
    const catalogRoute = byPath.get(path);
    const accept = acceptOf(resource);
    const row = {
      resource: url,
      host,
      path,
      method: listingMethod(resource),
      listed: {
        amount: accept.amount ?? null,
        asset: accept.asset ?? null,
        network: accept.network ?? null,
        payTo: accept.payTo ?? null,
        description: resource.description || "",
      },
      catalog: catalogRoute
        ? {
            amount: catalogRoute.amount,
            asset: catalogRoute.asset,
            network: catalogRoute.network,
            payTo: catalogRoute.payTo,
            description: catalogRoute.description,
            resourceUrl: catalogRoute.resourceUrl,
          }
        : null,
      classification: "unknown",
    };

    if (!catalogRoute) {
      row.classification = "unmatched";
      records.push(row);
      continue;
    }

    if (host === catalog.host) listedCanonical.add(path);
    const paymentBefore = diff.length;
    comparePayment(accept, catalogRoute, url, diff);
    const paymentChanged = diff.length > paymentBefore;
    if ((resource.description || "") !== (catalogRoute.description || "")) {
      pushDiff(diff, {
        resource: url,
        field: "description",
        listed: resource.description || "",
        catalog: catalogRoute.description || "",
      });
      row.descriptionDrift = true;
    }
    row.classification = paymentChanged ? "stale" : "healthy";
    records.push(row);
  }

  const missing = [];
  for (const route of catalog.discoveryRoutes) {
    if (listedCanonical.has(route.path)) continue;
    missing.push({
      resource: route.resourceUrl,
      path: route.path,
      method: route.method,
      classification: "missing",
      catalog: {
        amount: route.amount,
        asset: route.asset,
        network: route.network,
        payTo: route.payTo,
        description: route.description,
      },
    });
    pushDiff(diff, {
      resource: route.resourceUrl,
      field: "presence",
      listed: null,
      catalog: route.resourceUrl,
    });
  }

  const staleListed = records.filter((row) => row.classification === "stale");
  const healthyListed = records.filter((row) => row.classification === "healthy");
  const classification = staleListed.length > 0 || missing.length > 0 ? "stale" : "healthy";

  return {
    surface: "bazaar",
    classification,
    listingCount: resources.length,
    healthyListed: healthyListed.length,
    staleListed: staleListed.length,
    missingCount: missing.length,
    descriptionDriftCount: records.filter((row) => row.descriptionDrift).length,
    records: records.map(compactBazaarRecord),
    missing: missing.map((row) => ({
      resource: row.resource,
      path: row.path,
      method: row.method,
      classification: row.classification,
      catalog: row.catalog,
    })),
    diff,
  };
}

function compactBazaarRecord(row) {
  return {
    resource: row.resource,
    host: row.host,
    path: row.path,
    method: row.method,
    classification: row.classification,
    descriptionDrift: Boolean(row.descriptionDrift),
    listed: {
      amount: row.listed.amount,
      asset: row.listed.asset,
      network: row.listed.network,
      payTo: row.listed.payTo,
    },
    catalog: row.catalog
      ? {
          amount: row.catalog.amount,
          asset: row.catalog.asset,
          network: row.catalog.network,
          payTo: row.catalog.payTo,
          resourceUrl: row.catalog.resourceUrl,
        }
      : null,
  };
}

export function bazaarWouldSend(catalog, bazaarDiff) {
  const byPath = catalogByPath(catalog);
  const requests = [];
  const seen = new Set();

  function enqueue(resourceUrl, route) {
    if (!route || seen.has(resourceUrl)) return;
    seen.add(resourceUrl);
    requests.push({
      method: "POST",
      url: BAZAAR_WRITE_URL,
      headers: { "content-type": "application/json" },
      body: {
        resource: resourceUrl,
        type: "http",
        description: route.description,
        serviceName: route.serviceName,
        accepts: route.accepts,
      },
      note: "Bazaar has no public rematerialize API. This is the exact body a write would carry, copied from the origin x402 catalog.",
    });
  }

  for (const row of bazaarDiff.records) {
    if (row.classification !== "stale") continue;
    enqueue(row.resource, byPath.get(row.path));
  }
  for (const row of bazaarDiff.missing) {
    enqueue(row.resource, byPath.get(row.path));
  }
  return requests;
}

function textBlob(value) {
  return JSON.stringify(value).toLowerCase();
}

export function diffMpp(catalog, listing) {
  const services = listing?.services || [];
  const needles = [catalog.host, "samedaydesk", catalog.origin.replace(/^https:\/\//, "")];
  const hits = services.filter((service) => {
    const blob = textBlob(service);
    return needles.some((needle) => blob.includes(String(needle).toLowerCase()));
  });
  const diff = [];
  if (hits.length === 0) {
    diff.push({
      resource: catalog.origin,
      field: "presence",
      listed: null,
      catalog: catalog.origin,
    });
  }
  return {
    surface: "mpp",
    classification: hits.length === 0 ? "missing" : "healthy",
    catalogVersion: listing?.version ?? null,
    serviceCount: services.length,
    hits,
    diff: hits.length === 0 ? diff : [],
  };
}

export function mppWouldSend(catalog) {
  const endpoints = catalog.discoveryRoutes.map((route) => ({
    method: route.method,
    path: route.path,
    description: route.description,
    payment: {
      intent: route.mpp?.intent || "charge",
      method: route.mpp?.method || "evm",
      currency: route.mpp?.currency || route.asset,
      decimals: 6,
      amount: route.amount,
      unitType: "request",
    },
  }));
  const assets = catalog.asset;
  const body = {
    id: "samedaydesk",
    name: catalog.title || "SameDayDesk",
    url: catalog.origin,
    serviceUrl: catalog.origin,
    description: catalog.description,
    icon: catalog.discoveryRoutes.find((route) => route.iconUrl)?.iconUrl || null,
    categories: catalog.serviceInfo?.categories || [],
    integration: "third-party",
    tags: ["x402", "mpp", "agents"],
    status: "active",
    docs: catalog.serviceInfo?.docs || {
      homepage: catalog.origin,
      apiReference: openApiUrl(catalog.origin),
    },
    methods: {
      evm: {
        intents: ["charge"],
        assets,
      },
    },
    realm: catalog.host,
    provider: {
      name: "SameDayDesk",
      url: "https://samedaydesk.com",
    },
    endpoints,
  };
  return [
    {
      method: "POST",
      url: MPP_WRITE_URL,
      headers: { "content-type": "application/json" },
      body,
      note: "Official catalog writes are GitHub PRs to tempoxyz/mpp schemas/services.ts. Body is the service record copied from the origin OpenAPI and x402 catalog.",
    },
  ];
}

export function parseMcpInitialize(payload) {
  const root = payload?.result ? payload.result : payload;
  return {
    name: root?.serverInfo?.name || null,
    version: root?.serverInfo?.version || null,
    protocolVersion: root?.protocolVersion || null,
  };
}

export function diffMcpRegistry(catalog, listing, initialize) {
  const server = listing?.servers?.[0]?.server || null;
  const liveVersion = initialize?.version || catalog.openapiVersion;
  const liveRemote = `${catalog.origin}/mcp`;
  const diff = [];
  if (!server) {
    diff.push({ resource: MCP_SERVER_NAME, field: "presence", listed: null, catalog: liveRemote });
    return {
      surface: "mcp-registry",
      classification: "missing",
      listed: null,
      live: { version: liveVersion, remote: liveRemote, name: initialize?.name || null },
      diff,
    };
  }
  if (String(server.version) !== String(liveVersion)) {
    diff.push({
      resource: server.name,
      field: "version",
      listed: server.version,
      catalog: liveVersion,
    });
  }
  const listedRemote = server.remotes?.[0]?.url || null;
  if (listedRemote && listedRemote.replace(/\/$/, "") !== liveRemote) {
    diff.push({
      resource: server.name,
      field: "remotes.0.url",
      listed: listedRemote,
      catalog: liveRemote,
    });
  }
  return {
    surface: "mcp-registry",
    classification: diff.length > 0 ? "stale" : "healthy",
    listed: {
      name: server.name,
      version: server.version,
      websiteUrl: server.websiteUrl,
      description: server.description,
      remotes: server.remotes,
      repository: server.repository,
      schema: server.$schema,
    },
    live: { version: liveVersion, remote: liveRemote, name: initialize?.name || null },
    diff,
  };
}

export function mcpRegistryWouldSend(catalog, mcpDiff, initialize) {
  const listed = mcpDiff.listed;
  const version = initialize?.version || catalog.openapiVersion;
  const body = {
    ...(listed?.schema ? { $schema: listed.schema } : {}),
    name: listed?.name || MCP_SERVER_NAME,
    description: listed?.description || catalog.description,
    ...(listed?.repository ? { repository: listed.repository } : {}),
    version,
    websiteUrl: listed?.websiteUrl || `${catalog.origin}/`,
    remotes: listed?.remotes || [{ type: "streamable-http", url: `${catalog.origin}/mcp` }],
  };
  return [
    {
      method: "POST",
      url: MCP_REGISTRY_PUBLISH,
      headers: { "content-type": "application/json" },
      body,
      note: "MCP Registry publish upserts an immutable version. Body version is the live origin catalog version.",
    },
  ];
}

export function diffAgentverse(catalog, listing) {
  const agents = listing?.agents || [];
  const owned = agents.filter((agent) => {
    const blob = `${agent.handle || ""} ${agent.name || ""} ${agent.description || ""} ${agent.readme || ""}`.toLowerCase();
    return blob.includes("samedaydesk") || (agent.handle || "").includes("samedaydesk");
  });
  const diff = [];
  const records = owned.map((agent) => {
    const status = agent.status || null;
    const row = {
      address: agent.address,
      handle: agent.handle,
      name: agent.name,
      status,
      type: agent.type,
      description: agent.description,
      lastUpdated: agent.last_updated,
    };
    if (status !== "active") {
      diff.push({
        resource: agent.address,
        field: "status",
        listed: status,
        catalog: "active",
      });
    }
    return row;
  });
  if (owned.length === 0) {
    diff.push({
      resource: catalog.origin,
      field: "presence",
      listed: null,
      catalog: catalog.origin,
    });
  }
  const classification = owned.length === 0 ? "missing" : diff.length > 0 ? "stale" : "healthy";
  return {
    surface: "agentverse",
    classification,
    total: listing?.total ?? agents.length,
    records,
    diff,
  };
}

export function agentverseWouldSend(agentverseDiff) {
  const requests = [];
  for (const row of agentverseDiff.records || []) {
    if (row.status === "active") continue;
    requests.push({
      method: "POST",
      url: agentverseStatusUrl(row.address),
      headers: { "content-type": "application/json" },
      body: {
        agent_identifier: row.address,
        is_active: true,
      },
      note: "Almanac status write. Hosted mailbox runtime is still required for the listing to stay active.",
    });
  }
  return requests;
}

export function catalogSummary(catalog) {
  return {
    origin: catalog.origin,
    openapiVersion: catalog.openapiVersion,
    discoveryItemCount: catalog.discoveryItemCount,
    paidOperationCount: catalog.paidOperationCount,
    payTo: catalog.payTo,
    asset: catalog.asset,
    network: catalog.network,
  };
}

export async function runSurface(surface, { fetchImpl, origin = DEFAULT_ORIGIN, apply = false, writes = [] } = {}) {
  if (!SURFACES.includes(surface)) {
    throw new Error(`unknown surface: ${surface}`);
  }
  const catalog = await loadSellerCatalog(fetchImpl, origin);
  let listingDiff;
  let wouldSend;
  let extra = {};

  if (surface === "bazaar") {
    const payTo = catalog.payTo[0];
    if (!payTo) throw new Error("origin x402 catalog did not advertise payTo");
    const listing = await readJson(fetchImpl, bazaarMerchantUrl(payTo));
    listingDiff = diffBazaar(catalog, listing);
    wouldSend = bazaarWouldSend(catalog, listingDiff);
    extra = { listingPayTo: listing.payTo ?? null, pagination: listing.pagination ?? null };
  } else if (surface === "mpp") {
    const listing = await readJson(fetchImpl, MPP_CATALOG_URL);
    listingDiff = diffMpp(catalog, listing);
    wouldSend = listingDiff.classification === "healthy" ? [] : mppWouldSend(catalog);
  } else if (surface === "mcp-registry") {
    const listing = await readJson(fetchImpl, MCP_REGISTRY_SEARCH);
    const initializeRaw = await readJson(fetchImpl, mcpUrl(catalog.origin), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "samedaydesk-presence-refresh", version: "1.0.0" },
        },
      }),
    });
    const initialize = parseMcpInitialize(initializeRaw);
    listingDiff = diffMcpRegistry(catalog, listing, initialize);
    wouldSend = listingDiff.classification === "healthy" ? [] : mcpRegistryWouldSend(catalog, listingDiff, initialize);
    extra = { initialize };
  } else if (surface === "agentverse") {
    const listing = await readJson(fetchImpl, AGENTVERSE_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search_text: "samedaydesk", offset: 0, limit: 10 }),
    });
    listingDiff = diffAgentverse(catalog, listing);
    wouldSend = listingDiff.classification === "healthy" ? [] : agentverseWouldSend(listingDiff);
  }

  const decision = applyDecision(listingDiff.diff, wouldSend);
  const sent = [];
  let applyState = "dry-run";
  if (apply) {
    if (!decision.allowed) {
      applyState = "refused";
    } else {
      applyState = "sent";
      for (const request of wouldSend) {
        const rec = await fetchImpl(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(request.body),
        });
        sent.push({
          method: request.method,
          url: request.url,
          status: rec.status,
          ok: rec.ok,
        });
      }
    }
  }

  const ok = listingDiff.classification === "healthy";
  return {
    ok,
    surface,
    classification: listingDiff.classification,
    apply: applyState,
    refuseReason: applyState === "refused" ? decision.reason : null,
    protectedHits: applyState === "refused" ? decision.protectedHits : [],
    catalog: catalogSummary(catalog),
    ...listingDiff,
    wouldSend,
    sent,
    extra,
    exitCode: ok ? 0 : 1,
  };
}

export async function runCli(argv, { fetchImpl, stdout, stderr } = {}) {
  const { values, positionals } = parseCliArgs(argv);
  if (values.help || positionals.length === 0) {
    (stderr || process.stderr).write(usage());
    return values.help ? 0 : 2;
  }
  const surface = positionals[0];
  if (!SURFACES.includes(surface)) {
    (stderr || process.stderr).write(`unknown surface: ${surface}\n${usage()}`);
    return 2;
  }
  const writes = [];
  let impl = fetchImpl;
  if (!impl) {
    if (values.fixture) {
      const pack = loadFixturePack(values.fixture);
      impl = createFixtureFetch(pack, { writes });
    } else {
      impl = (url, options) => liveFetch(url, options);
    }
  }
  const report = await runSurface(surface, {
    fetchImpl: impl,
    apply: values.apply,
    writes,
  });
  const payload = values.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);
  (stdout || process.stdout).write(`${payload}\n`);
  return report.exitCode;
}

export function parseCliArgs(argv) {
  const values = { apply: false, fixture: null, pretty: false, help: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") values.apply = true;
    else if (token === "--pretty") values.pretty = true;
    else if (token === "--help" || token === "-h") values.help = true;
    else if (token === "--fixture") {
      values.fixture = argv[i + 1];
      i += 1;
    } else if (token === "--dry-run") {
      values.apply = false;
    } else if (token.startsWith("-")) {
      throw new Error(`unknown argument: ${token}`);
    } else {
      positionals.push(token);
    }
  }
  return { values, positionals };
}

export function usage() {
  return `Presence refresh (dry-run by default). Catalog is origin OpenAPI + /.well-known/x402.json.

Usage:
  node tools/presence/refresh.mjs <surface> [--fixture <dir>] [--apply] [--pretty]

Surfaces:
  bazaar         CDP merchant discovery vs origin x402 catalog
  mpp            Official mpp.dev/api/services vs origin catalog
  agentverse     Agentverse search vs origin catalog
  mcp-registry   MCP Registry latest vs origin OpenAPI / MCP initialize

Nothing is sent unless --apply is passed.
--apply refuses when the diff or body would write price, payTo, asset, network, or facilitator.

--fixture uses fixtures/presence captures. Live mode is read-only unless --apply.
`;
}

export function defaultFixtureDir() {
  return DEFAULT_FIXTURE_DIR;
}

export function presenceRoot() {
  return dirname(fileURLToPath(import.meta.url));
}
