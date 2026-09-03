import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_COHORT_PATH = join(dirname(fileURLToPath(import.meta.url)), "cohort.json");
export const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../data/bazaar-tracker");

const VOLATILE_FIELDS = new Set(["lastUpdated", "quality"]);
const IDENTITY_FIELDS = new Set(["seller", "sellerId"]);

export function loadCohort(cohortPath = DEFAULT_COHORT_PATH) {
  const cohort = JSON.parse(readFileSync(cohortPath, "utf8"));
  if (!cohort?.endpoint || !Array.isArray(cohort.sellers) || cohort.sellers.length === 0) {
    throw new Error("cohort must declare an endpoint and a sellers array");
  }
  for (const seller of cohort.sellers) {
    if (!seller.id || !seller.name || !Array.isArray(seller.hosts) || seller.hosts.length === 0) {
      throw new Error(`seller ${seller.id || "?"} must have id, name, and hosts`);
    }
  }
  return cohort;
}

export function hostOf(resource) {
  try {
    return new URL(resource).host.toLowerCase();
  } catch {
    return "";
  }
}

export function matchesSeller(resource, seller) {
  const host = hostOf(resource);
  return seller.hosts.some((allowed) => host === String(allowed).toLowerCase());
}

export function resourcePathPrefixes(resource) {
  try {
    const url = new URL(resource);
    const parts = url.pathname.split("/").filter(Boolean);
    const prefixes = [url.host];
    let acc = url.host;
    for (const part of parts) {
      acc += `/${part}`;
      prefixes.push(acc);
    }
    return prefixes;
  } catch {
    return [];
  }
}

export function searchUrl(endpoint, query, limit = 20) {
  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  return url.href;
}

export function normalizeDiscoveryRow(row, seller) {
  return {
    seller: seller.name,
    sellerId: seller.id,
    resource: row.resource,
    type: row.type ?? null,
    x402Version: row.x402Version ?? null,
    description: row.description ?? null,
    accepts: row.accepts ?? [],
    extensions: row.extensions ?? null,
    lastUpdated: row.lastUpdated ?? null,
    quality: row.quality ?? null,
  };
}

function stableValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(stableStringify(value));
}

export function stableStringify(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function flattenComparable(row, prefix = "") {
  const out = {};
  if (row === null || row === undefined) {
    if (prefix) out[prefix] = null;
    return out;
  }
  if (typeof row !== "object") {
    out[prefix || "value"] = row;
    return out;
  }
  if (Array.isArray(row)) {
    if (row.length === 0) {
      if (prefix) out[prefix] = [];
      return out;
    }
    row.forEach((item, index) => {
      Object.assign(out, flattenComparable(item, prefix ? `${prefix}.${index}` : String(index)));
    });
    return out;
  }
  const keys = Object.keys(row).sort();
  if (keys.length === 0) {
    if (prefix) out[prefix] = {};
    return out;
  }
  for (const key of keys) {
    if (!prefix && (VOLATILE_FIELDS.has(key) || IDENTITY_FIELDS.has(key))) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    Object.assign(out, flattenComparable(row[key], path));
  }
  return out;
}

export function diffSnapshots(previous, current, observedAt) {
  const prevRows = new Map((previous?.rows ?? []).map((row) => [row.resource, row]));
  const nextRows = new Map((current?.rows ?? []).map((row) => [row.resource, row]));
  const changes = [];
  const routes = [...new Set([...prevRows.keys(), ...nextRows.keys()])].sort();

  for (const route of routes) {
    const beforeRow = prevRows.get(route);
    const afterRow = nextRows.get(route);
    if (!beforeRow) {
      changes.push({
        route,
        field: "resource",
        before: null,
        after: route,
        observedAt,
      });
      continue;
    }
    if (!afterRow) {
      changes.push({
        route,
        field: "resource",
        before: route,
        after: null,
        observedAt,
      });
      continue;
    }
    const beforeFields = flattenComparable(beforeRow);
    const afterFields = flattenComparable(afterRow);
    const fields = [...new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])].sort();
    for (const field of fields) {
      const before = beforeFields[field] ?? null;
      const after = afterFields[field] ?? null;
      if (stableStringify(before) === stableStringify(after)) continue;
      changes.push({
        route,
        field,
        before: stableValue(before),
        after: stableValue(after),
        observedAt,
      });
    }
  }
  return changes;
}

export function snapshotFilename(observedAt) {
  const stamp = new Date(observedAt).toISOString().replace(/[:.]/g, "-");
  return `${stamp}.json`;
}

export function listSnapshotFiles(dataDir) {
  const dir = join(dataDir, "snapshots");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

export function previousSnapshotPath(dataDir, excludingName = null) {
  const names = listSnapshotFiles(dataDir).filter((name) => name !== excludingName);
  if (names.length === 0) return null;
  return join(dataDir, "snapshots", names[names.length - 1]);
}

export function readSnapshot(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeSnapshot(dataDir, snapshot) {
  // Full pretty JSON stays local for --from replay. Do not git-add snapshots/.
  const dir = join(dataDir, "snapshots");
  mkdirSync(dir, { recursive: true });
  const name = snapshotFilename(snapshot.observedAt);
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return path;
}

export function digestPath(dataDir) {
  return join(dataDir, "digest.json");
}

export function hashComparableFields(row) {
  return createHash("sha256")
    .update(
      stableStringify({
        description: row?.description ?? null,
        accepts: row?.accepts ?? [],
        extensions: row?.extensions ?? null,
      }),
    )
    .digest("hex");
}

export function routeDigest(row) {
  return {
    resource: row.resource,
    hash: hashComparableFields(row),
  };
}

export function compactDigestFromSnapshot(snapshot) {
  const routes = [...(snapshot?.rows ?? [])]
    .map(routeDigest)
    .sort((a, b) => a.resource.localeCompare(b.resource));
  return {
    schemaVersion: 1,
    observedAt: snapshot?.observedAt ?? null,
    source: snapshot?.source ?? null,
    endpoint: snapshot?.endpoint ?? null,
    rowCount: routes.length,
    routes,
  };
}

export function writeCompactDigest(dataDir, snapshot) {
  mkdirSync(dataDir, { recursive: true });
  const path = digestPath(dataDir);
  writeFileSync(path, `${JSON.stringify(compactDigestFromSnapshot(snapshot), null, 2)}\n`);
  return path;
}

export function readCompactDigest(dataDir) {
  const path = digestPath(dataDir);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function changelogPath(dataDir) {
  return join(dataDir, "changelog.jsonl");
}

export function appendChangelog(dataDir, changes) {
  if (changes.length === 0) return changelogPath(dataDir);
  mkdirSync(dataDir, { recursive: true });
  const path = changelogPath(dataDir);
  const body = changes.map((change) => JSON.stringify(change)).join("\n") + "\n";
  appendFileSync(path, body);
  return path;
}

export function readChangelog(dataDir) {
  const path = changelogPath(dataDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseSearchBody(body) {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  const text = typeof body === "string" ? body : body == null ? "" : String(body);
  if (!text) return {};
  return JSON.parse(text);
}

export async function liveFetch(url, { timeoutMs = 20000, userAgent = "samedaydesk-bazaar-tracker/1.0" } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: ac.signal,
      headers: { "user-agent": userAgent, accept: "application/json" },
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

export function createFixtureFetch(fixture) {
  const responses = fixture.responses ?? fixture;
  return async (url) => {
    const parsed = new URL(url);
    const query = parsed.searchParams.get("query") || "";
    const record = responses[url] ?? responses[query] ?? responses["*"];
    if (!record) {
      return {
        status: 200,
        ok: true,
        url,
        body: JSON.stringify({ resources: [], partialResults: false }),
      };
    }
    return {
      status: record.status ?? 200,
      ok: record.ok ?? true,
      url,
      body: typeof record.body === "string" ? record.body : JSON.stringify(record.body ?? { resources: [] }),
    };
  };
}

async function searchOnce(cohort, query, fetchImpl) {
  const url = searchUrl(cohort.endpoint, query);
  const rec = await fetchImpl(url);
  if (rec.error) {
    throw new Error(`CDP Bazaar search failed for ${query}: ${rec.error}`);
  }
  if (!rec.ok) {
    throw new Error(`CDP Bazaar search HTTP ${rec.status} for ${query}: ${String(rec.body).slice(0, 200)}`);
  }
  const payload = parseSearchBody(rec.body);
  return {
    query,
    resources: Array.isArray(payload.resources) ? payload.resources : [],
    partialResults: Boolean(payload.partialResults),
  };
}

export async function fetchSellerRows(cohort, seller, fetchImpl) {
  const found = new Map();
  const queued = [...(seller.queries ?? seller.hosts)];
  const seen = new Set();
  const usedQueries = [];
  let partial = false;
  const maxQueries = cohort.maxQueriesPerSeller ?? 12;

  while (queued.length > 0 && usedQueries.length < maxQueries) {
    const query = queued.shift();
    if (seen.has(query)) continue;
    seen.add(query);
    const page = await searchOnce(cohort, query, fetchImpl);
    usedQueries.push(query);
    if (page.partialResults) partial = true;
    for (const row of page.resources) {
      if (!row?.resource || !matchesSeller(row.resource, seller)) continue;
      if (!found.has(row.resource)) found.set(row.resource, normalizeDiscoveryRow(row, seller));
    }
    if (page.partialResults) {
      for (const row of found.values()) {
        for (const prefix of resourcePathPrefixes(row.resource).slice(0, 3)) {
          if (!seen.has(prefix)) queued.push(prefix);
        }
      }
    }
  }

  return {
    seller,
    rows: [...found.values()].sort((a, b) => a.resource.localeCompare(b.resource)),
    queries: usedQueries,
    partial,
  };
}

export async function collectCohortSnapshot(cohort, fetchImpl, { observedAt, source = "live" } = {}) {
  const sellerSummaries = [];
  const rows = [];
  for (const seller of cohort.sellers) {
    const result = await fetchSellerRows(cohort, seller, fetchImpl);
    sellerSummaries.push({
      id: seller.id,
      name: seller.name,
      hosts: seller.hosts,
      rowCount: result.rows.length,
      queries: result.queries,
      partial: result.partial,
    });
    rows.push(...result.rows);
  }
  rows.sort((a, b) => a.resource.localeCompare(b.resource) || a.sellerId.localeCompare(b.sellerId));
  return {
    schemaVersion: 1,
    observedAt,
    source,
    endpoint: cohort.endpoint,
    sellers: sellerSummaries,
    rowCount: rows.length,
    rows,
  };
}

export function snapshotFromRows(rows, { observedAt, source = "synthetic", endpoint = null, sellers = [] } = {}) {
  return {
    schemaVersion: 1,
    observedAt,
    source,
    endpoint,
    sellers,
    rowCount: rows.length,
    rows,
  };
}

export function editSnapshot(snapshot, mutate) {
  const clone = JSON.parse(JSON.stringify(snapshot));
  mutate(clone);
  clone.rowCount = clone.rows.length;
  return clone;
}

export async function runTracker({
  cohort,
  dataDir,
  fetchImpl,
  observedAt = new Date().toISOString(),
  source = "live",
  incomingSnapshot = null,
} = {}) {
  mkdirSync(join(dataDir, "snapshots"), { recursive: true });
  const current = incomingSnapshot
    ? { ...incomingSnapshot, observedAt, source: incomingSnapshot.source ?? source, rowCount: incomingSnapshot.rows.length }
    : await collectCohortSnapshot(cohort, fetchImpl, { observedAt, source });

  const snapshotPath = writeSnapshot(dataDir, current);
  const compactDigestPath = writeCompactDigest(dataDir, current);
  const previousPath = previousSnapshotPath(dataDir, snapshotFilename(current.observedAt));
  const previous = previousPath ? readSnapshot(previousPath) : null;
  const changes = previous ? diffSnapshots(previous, current, observedAt) : [];
  const logPath = appendChangelog(dataDir, changes);

  return {
    ok: true,
    observedAt,
    snapshotPath,
    digestPath: compactDigestPath,
    previousSnapshotPath: previousPath,
    changelogPath: logPath,
    rowCount: current.rows.length,
    sellerCount: current.sellers?.length ?? cohort.sellers.length,
    changeCount: changes.length,
    changes,
    snapshot: current,
  };
}
