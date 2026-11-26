import { availableCatalogOffers } from "./catalog.js";
import { mcpSubjectKey, x402SubjectKey } from "./records.js";
import { publicFacts } from "./privacy.js";

export const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const DISCLAIMER = "This is a SameDayDesk public check of recorded evidence. It is not an independent certification, a live payment, or proof of settlement or authority.";

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

function methodsOf(records) {
  const methods = [];
  for (const record of records) {
    if (record.method) methods.push(record.method);
    for (const observation of record.observations || []) {
      if (observation.method && !methods.includes(observation.method)) methods.push(observation.method);
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
  }
  if (kind === "x402") {
    const unmarked = observations.filter((item) => item.registryStatus === "unknown" || item.unpaid402OutputSchemaPresent === false);
    const postsUnmarked = limitations.some((line) => /POST routes were not transmitted/i.test(line));
    if (postsUnmarked) flags.push("POST routes were not transmitted and remain unmarked");
    if (observations.some((item) => item.registryStatus === "alternate")) flags.push("At least one route is an alternate, not a confirmed green observation");
    const settlement = observations.some((item) => item.paymentReceipt || item.settlement);
    if (!settlement) flags.push("No payment-receipt settlement is in the evidence");
    if (unmarked.length) flags.push("Some routes remain unknown or unmarked");
  }
  if (observations.some((item) => (item.registryStatus || item.status) === "unknown")) {
    flags.push("Unknown states were preserved from the source records");
  }
  if (records.some((record) => record.incomplete || record.partial)) flags.push("Source record is marked incomplete or partial");
  return flags;
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
  if (httpStatusOnly(records)) incompleteFlags.unshift("HTTP status alone is not a pass");
  const incomplete = unknown || incompleteFlags.length > 0 || httpStatusOnly(records);
  const status = overallStatus({ failed, stale, incomplete, unknown });
  const limitations = [
    ...new Set(records.flatMap((record) => record.limitations || [])),
    ...incompleteFlags,
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
    scope: kind === "mcp"
      ? ["mcp.registry.listing", "mcp.initialize"]
      : ["x402.unpaid-get", "x402.catalog-capture"],
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
      if (!key) continue;
      const list = mcp.get(key) || [];
      list.push(record);
      mcp.set(key, list);
    } else if (record.kind === "x402") {
      const key = x402SubjectKey(record.subject);
      if (!key) continue;
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
