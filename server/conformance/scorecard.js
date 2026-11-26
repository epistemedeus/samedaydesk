import { availableCatalogOffers } from "./catalog.js";
import { mcpSubjectKey, x402SubjectKey } from "./records.js";
import { publicFacts } from "./privacy.js";
import { isMcpSubject, isX402Host } from "./subjects.js";

export const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const DISCLAIMER = "This is a SameDayDesk public check of recorded evidence. It is not an independent certification, a live payment, or proof of settlement or authority.";
export const OFFICIAL_MCP_PROTOCOL_VERSIONS = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
  "2026-07-28",
];
export const OFFICIAL_MCP_PROTOCOL_VERSIONS_RETRIEVED_AT = "2026-11-26T12:48:26Z";

function parseTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function newestCheckedAt(records) {
  let newest = null;
  let newestMs = -Infinity;
  for (const record of records) {
    const ms = parseTime(record.checkedAt);
    if (ms != null && ms >= newestMs) {
      newestMs = ms;
      newest = record.checkedAt;
    }
  }
  return newest;
}

function displayMethod(observation) {
  const method = observation.method || "";
  if (String(method).toUpperCase() === "POST" && observation.unpaid402OutputSchemaPresent === false) {
    return "POST (schema unmarked)";
  }
  return method;
}

function methodsOf(records) {
  const methods = [];
  for (const record of records) {
    if (record.method) methods.push(record.method);
    for (const observation of record.observations || []) {
      const method = displayMethod(observation);
      if (method && !methods.includes(method)) methods.push(method);
    }
  }
  return methods;
}

function hasFailure(records) {
  for (const record of records) {
    if (record.failed || record.status === "failed") return true;
    for (const observation of record.observations || []) {
      const status = String(observation.registryStatus || observation.status || "").toLowerCase();
      if (status === "failed" || status === "error" || status === "fail" || observation.failed === true) return true;
    }
  }
  return false;
}

function httpStatusOnly(records) {
  return records.length > 0 && records.every((record) => {
    const observations = record.observations || [];
    if (observations.length > 0) return false;
    return record.httpStatus != null && !record.initialize && !record.unpaid402;
  });
}

function deriveScope(kind, records) {
  const observations = records.flatMap((record) => record.observations || []);
  const scope = [];
  if (kind === "mcp") {
    if (observations.some((item) => item.id === "mcp-registry-listing")) scope.push("mcp.registry.listing");
    if (observations.some((item) => item.id === "mcp-initialize")) scope.push("mcp.initialize");
  }
  if (kind === "x402") {
    if (observations.some((item) => item.unpaid402 || /unpaid GET 402/i.test(item.method || "") || /unpaid-get/i.test(item.id || ""))) {
      scope.push("x402.unpaid-get");
    }
    if (observations.some((item) => item.id === "presence-x402-catalog" || item.x402Version != null || /catalog/i.test(item.id || "") || /well-known\/x402/i.test(item.route || ""))) {
      scope.push("x402.catalog-capture");
    }
  }
  return scope;
}

function observedProtocolVersion(records) {
  for (const record of records) {
    for (const observation of record.observations || []) {
      if (observation.protocolVersion) return observation.protocolVersion;
    }
  }
  return null;
}

function observedX402Version(records) {
  for (const record of records) {
    if (record.meta?.x402Version != null) return record.meta.x402Version;
    for (const observation of record.observations || []) {
      if (observation.x402Version != null) return observation.x402Version;
    }
  }
  return null;
}

function wellKnownPaths(records) {
  const paths = [];
  for (const record of records) {
    for (const item of record.meta?.wellKnownPaths || []) {
      if (item && !paths.includes(item)) paths.push(item);
    }
    for (const observation of record.observations || []) {
      if (observation.route && /well-known\/x402/i.test(observation.route) && !paths.includes(observation.route)) {
        paths.push(observation.route);
      }
    }
  }
  return paths;
}

function registrySchema(records) {
  for (const record of records) {
    if (record.meta?.registrySchema) return record.meta.registrySchema;
    for (const observation of record.observations || []) {
      if (observation.registrySchema) return observation.registrySchema;
    }
  }
  return null;
}

function completeness(kind, records) {
  const limitations = records.flatMap((record) => record.limitations || []);
  const observations = records.flatMap((record) => record.observations || []);
  const flags = [];

  if (httpStatusOnly(records)) {
    flags.push("HTTP status alone is not a pass");
  }
  if (kind === "mcp") {
    const registry = observations.find((item) => item.id === "mcp-registry-listing");
    const initialize = observations.find((item) => item.id === "mcp-initialize");
    if (!registry || !initialize) flags.push("MCP registry listing or initialize observation is missing");
    if (registry && initialize && registry.registryVersion && initialize.serverVersion && registry.registryVersion !== initialize.serverVersion) {
      flags.push(`Schema or version drift: registry ${registry.registryVersion} vs initialize ${initialize.serverVersion}`);
    }
    const osRates = observations.some((item) => item.windows || item.macos || item.linux || item.osPassRates);
    if (!osRates) flags.push("Windows/macOS/Linux pass rates were not in the evidence");
    const protocolVersion = observedProtocolVersion(records);
    if (!protocolVersion) flags.push("No MCP protocol version was observed");
  }
  if (kind === "x402") {
    const unmarked = observations.filter((item) => item.registryStatus === "unknown" || item.unpaid402OutputSchemaPresent === false);
    const postsUnmarked = limitations.some((line) => /POST routes were not transmitted/i.test(line));
    if (postsUnmarked) flags.push("POST routes were not transmitted and remain unmarked");
    if (observations.some((item) => item.registryStatus === "alternate")) flags.push("At least one route is an alternate, not a confirmed green observation");
    const settlement = observations.some((item) => item.paymentReceipt || item.settlement);
    if (!settlement) flags.push("No payment-receipt settlement is in the evidence");
    if (unmarked.length) flags.push("Some routes remain unknown or unmarked");
    const x402Version = observedX402Version(records);
    if (x402Version == null && observations.some((item) => item.id === "presence-x402-catalog" || /well-known\/x402/i.test(item.route || ""))) {
      flags.push("The catalog capture did not include an x402Version");
    }
  }
  if (observations.some((item) => (item.registryStatus || item.status) === "unknown")) {
    flags.push("Unknown states were preserved from the source records");
  }
  if (records.some((record) => record.incomplete || record.partial)) flags.push("Source record is marked incomplete or partial");
  return flags;
}


function versionDisclosures(kind, records) {
  const notes = [];
  if (kind === "mcp") {
    const protocolVersion = observedProtocolVersion(records);
    if (protocolVersion) {
      const later = OFFICIAL_MCP_PROTOCOL_VERSIONS.filter((version) => version > protocolVersion);
      if (later.length) {
        notes.push(`Observed MCP protocolVersion ${protocolVersion}. Later official revisions ${later.join(", ")} are unclaimed (official pages retrieved ${OFFICIAL_MCP_PROTOCOL_VERSIONS_RETRIEVED_AT}). This is not a claim of current MCP ${OFFICIAL_MCP_PROTOCOL_VERSIONS.at(-1)}.`);
      }
    }
    const schema = registrySchema(records);
    if (schema) {
      notes.push(`MCP Registry listing document schema is ${schema}. That schema date is not an MCP protocol version.`);
    }
  }
  if (kind === "x402") {
    const x402Version = observedX402Version(records);
    if (x402Version != null) {
      notes.push(`Observed x402Version ${x402Version}. Other x402 versions were not in this evidence.`);
    }
    const paths = wellKnownPaths(records);
    if (paths.length > 1) {
      notes.push(`First-party records disagree on the well-known path (${paths.join(" vs ")}). Both spellings are recorded; they were not equated.`);
    }
  }
  return notes;
}

function overallStatus({ failed, stale, incomplete, unknown }) {
  if (unknown) return "unknown";
  if (failed) return "failed";
  if (stale) return "stale";
  if (incomplete) return "partial";
  return "checked";
}

export function buildScorecard(kind, subject, records, { now = Date.now(), staleAfterMs = STALE_AFTER_MS, env = process.env } = {}) {
  const checkedAt = newestCheckedAt(records);
  const checkedAtMs = parseTime(checkedAt);
  const unknown = records.length === 0;
  const failed = !unknown && hasFailure(records);
  const stale = !unknown && (checkedAtMs == null || now - checkedAtMs > staleAfterMs);
  const incompleteFlags = unknown ? ["No public check is on record"] : completeness(kind, records);
  const incomplete = unknown || incompleteFlags.length > 0 || httpStatusOnly(records);
  const status = overallStatus({ failed, stale, incomplete, unknown });
  const limitations = [
    ...new Set(records.flatMap((record) => record.limitations || [])),
    ...incompleteFlags,
    ...versionDisclosures(kind, records),
    DISCLAIMER,
  ];
  return publicFacts({
    kind,
    subject,
    subjectKey: kind === "mcp" ? mcpSubjectKey(subject) : x402SubjectKey(subject),
    status,
    freshness: unknown ? "unknown" : stale ? "stale" : "current",
    completeness: unknown ? "unknown" : incomplete ? "incomplete" : "complete",
    failed,
    checkedAt,
    methods: methodsOf(records),
    scope: deriveScope(kind, records),
    observedProtocolVersion: kind === "mcp" ? observedProtocolVersion(records) : null,
    observedX402Version: kind === "x402" ? observedX402Version(records) : null,
    registrySchema: kind === "mcp" ? registrySchema(records) : null,
    wellKnownPaths: kind === "x402" ? wellKnownPaths(records) : [],
    observations: records.flatMap((record) => (record.observations || []).map((item) => publicFacts({ ...item, source: record.source }))),
    sources: [...new Set(records.map((record) => record.source).filter(Boolean))],
    limitations,
    catalog: availableCatalogOffers(env),
    certification: false,
    livePayment: false,
    authorityClaim: false,
  });
}

export function listDirectory(records, options = {}) {
  const mcp = new Map();
  const x402 = new Map();
  for (const record of records) {
    if (record.kind === "mcp") {
      const key = mcpSubjectKey(record.subject);
      if (!key || !isMcpSubject(record.subject.org, record.subject.repo)) continue;
      const list = mcp.get(key) || [];
      list.push(record);
      mcp.set(key, list);
    } else if (record.kind === "x402") {
      const key = x402SubjectKey(record.subject);
      if (!key || !isX402Host(key)) continue;
      const list = x402.get(key) || [];
      list.push(record);
      x402.set(key, list);
    }
  }
  return {
    mcp: [...mcp.entries()].map(([key, list]) => buildScorecard("mcp", list[0].subject, list, options)),
    x402: [...x402.entries()].map(([key, list]) => buildScorecard("x402", list[0].subject, list, options)),
    catalog: availableCatalogOffers(options.env),
    disclaimer: DISCLAIMER,
  };
}
