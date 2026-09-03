import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_COHORT_PATH = join(dirname(fileURLToPath(import.meta.url)), "cohort.json");
export const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../data/bazaar-tracker");
export const OBSERVATION_SCHEMA = "samedaydesk.bazaar-observation.v2";
export const CDP_DISCOVERY_SOURCE = "cdp-discovery";
export const ACCEPTS_COMPACT_KEYS = Object.freeze([
  "scheme",
  "network",
  "amount",
  "asset",
  "payTo",
  "maxAmountRequired",
]);

const VOLATILE_FIELDS = new Set(["lastUpdated", "quality"]);
const IDENTITY_FIELDS = new Set(["seller", "sellerId"]);
const HUMAN_CHANGELOG_HEADER = `# Bazaar rematerialization changelog

One-shot, cron-free field changes for the repaired-seller cohort. Full CDP
discovery snapshots stay in ignored \`snapshots/\`; Git tracks only the compact
source-separated observation record and this log.

Volatile catalog fields (\`lastUpdated\`, \`quality\`) are stored on local
snapshots when present and excluded from the changelog.

`;

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
  const dir = join(dataDir, "snapshots");
  mkdirSync(dir, { recursive: true });
  const name = snapshotFilename(snapshot.observedAt);
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return path;
}

export function changelogPath(dataDir) {
  return join(dataDir, "changelog.jsonl");
}

export function observationPath(dataDir) {
  return join(dataDir, "observations.json");
}

export function humanChangelogPath(dataDir) {
  return join(dataDir, "CHANGELOG.md");
}

export function digestValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function compactAccepts(accepts) {
  return (accepts ?? []).map((item) => {
    if (!item || typeof item !== "object") return item ?? null;
    const compact = {};
    for (const key of ACCEPTS_COMPACT_KEYS) {
      if (item[key] !== undefined) compact[key] = item[key];
    }
    return compact;
  });
}

export function isObservationRecord(value) {
  return Boolean(value && typeof value === "object" && value.sources && !Array.isArray(value.rows));
}

function extensionsDigestOf(row) {
  if (row?.extensions !== undefined && row.extensions !== null) return digestValue(row.extensions);
  if (typeof row?.extensionsDigest === "string" && /^[0-9a-f]{64}$/i.test(row.extensionsDigest)) {
    return row.extensionsDigest;
  }
  return digestValue(null);
}

export function compactRouteObservation(row, { source = CDP_DISCOVERY_SOURCE } = {}) {
  const accepts = compactAccepts(row.accepts);
  const extensionsDigest = extensionsDigestOf(row);
  const comparable = {
    type: row.type ?? null,
    x402Version: row.x402Version ?? null,
    description: row.description ?? null,
    accepts,
    extensionsDigest,
  };
  return {
    route: row.resource,
    seller: row.seller ?? null,
    sellerId: row.sellerId ?? null,
    source,
    type: comparable.type,
    x402Version: comparable.x402Version,
    description: comparable.description,
    accepts,
    extensionsDigest,
    comparableDigest: digestValue(comparable),
  };
}

export function observationRecordFromSnapshot(snapshot, { source = CDP_DISCOVERY_SOURCE } = {}) {
  const captureSource = snapshot?.source ?? "live";
  const resolvedSource = source;
  const bySeller = new Map();
  for (const summary of snapshot?.sellers ?? []) {
    bySeller.set(summary.id, {
      id: summary.id,
      name: summary.name,
      hosts: summary.hosts ?? [],
      queries: summary.queries ?? [],
      partial: Boolean(summary.partial),
      rowCount: 0,
      routes: {},
    });
  }
  for (const row of snapshot?.rows ?? []) {
    const obs = compactRouteObservation(row, { source: resolvedSource });
    let seller = bySeller.get(row.sellerId);
    if (!seller) {
      seller = {
        id: row.sellerId,
        name: row.seller,
        hosts: [],
        queries: [],
        partial: false,
        rowCount: 0,
        routes: {},
      };
      bySeller.set(row.sellerId, seller);
    }
    seller.routes[obs.route] = {
      type: obs.type,
      x402Version: obs.x402Version,
      description: obs.description,
      accepts: obs.accepts,
      extensionsDigest: obs.extensionsDigest,
      comparableDigest: obs.comparableDigest,
    };
    seller.rowCount = Object.keys(seller.routes).length;
  }
  const sellers = Object.fromEntries([...bySeller.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const routeCount = Object.values(sellers).reduce((sum, seller) => sum + seller.rowCount, 0);
  return {
    schemaVersion: 2,
    schema: OBSERVATION_SCHEMA,
    observedAt: snapshot?.observedAt ?? null,
    captureSource,
    sources: {
      [CDP_DISCOVERY_SOURCE]: {
        endpoint: snapshot?.endpoint ?? null,
        sellerCount: Object.keys(sellers).length,
        routeCount,
        sellers,
      },
    },
  };
}

export function flattenObservationRoutes(record) {
  const routes = new Map();
  for (const [sourceId, source] of Object.entries(record?.sources ?? {})) {
    for (const seller of Object.values(source.sellers ?? {})) {
      for (const [route, fields] of Object.entries(seller.routes ?? {})) {
        routes.set(`${sourceId}\t${route}`, {
          source: sourceId,
          sellerId: seller.id,
          seller: seller.name,
          route,
          type: fields.type ?? null,
          x402Version: fields.x402Version ?? null,
          description: fields.description ?? null,
          accepts: fields.accepts ?? [],
          extensionsDigest: fields.extensionsDigest ?? null,
        });
      }
    }
  }
  return routes;
}

export function diffObservations(previous, current, observedAt) {
  const prevRoutes = flattenObservationRoutes(previous);
  const nextRoutes = flattenObservationRoutes(current);
  const changes = [];
  const keys = [...new Set([...prevRoutes.keys(), ...nextRoutes.keys()])].sort();

  for (const key of keys) {
    const beforeRow = prevRoutes.get(key);
    const afterRow = nextRoutes.get(key);
    const route = (afterRow ?? beforeRow).route;
    const source = (afterRow ?? beforeRow).source;
    if (!beforeRow) {
      changes.push({
        route,
        source,
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
        source,
        field: "resource",
        before: route,
        after: null,
        observedAt,
      });
      continue;
    }
    const beforeFields = flattenComparable({
      type: beforeRow.type,
      x402Version: beforeRow.x402Version,
      description: beforeRow.description,
      accepts: beforeRow.accepts,
      extensionsDigest: beforeRow.extensionsDigest,
    });
    const afterFields = flattenComparable({
      type: afterRow.type,
      x402Version: afterRow.x402Version,
      description: afterRow.description,
      accepts: afterRow.accepts,
      extensionsDigest: afterRow.extensionsDigest,
    });
    const fields = [...new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])].sort();
    for (const field of fields) {
      const before = beforeFields[field] ?? null;
      const after = afterFields[field] ?? null;
      if (stableStringify(before) === stableStringify(after)) continue;
      changes.push({
        route,
        source,
        field,
        before: stableValue(before),
        after: stableValue(after),
        observedAt,
      });
    }
  }
  return changes;
}

export function snapshotFromObservation(record) {
  const sourceId = Object.keys(record?.sources ?? {})[0] || CDP_DISCOVERY_SOURCE;
  const source = record?.sources?.[sourceId] ?? {};
  const rows = [];
  const sellers = [];
  for (const seller of Object.values(source.sellers ?? {})) {
    sellers.push({
      id: seller.id,
      name: seller.name,
      hosts: seller.hosts ?? [],
      queries: seller.queries ?? [],
      partial: Boolean(seller.partial),
      rowCount: seller.rowCount ?? Object.keys(seller.routes ?? {}).length,
    });
    for (const [route, fields] of Object.entries(seller.routes ?? {})) {
      rows.push({
        seller: seller.name,
        sellerId: seller.id,
        resource: route,
        type: fields.type ?? null,
        x402Version: fields.x402Version ?? null,
        description: fields.description ?? null,
        accepts: fields.accepts ?? [],
        extensionsDigest: fields.extensionsDigest ?? null,
        extensions: null,
        lastUpdated: null,
        quality: null,
      });
    }
  }
  rows.sort((left, right) => left.resource.localeCompare(right.resource) || left.sellerId.localeCompare(right.sellerId));
  return snapshotFromRows(rows, {
    observedAt: record?.observedAt,
    source: record?.captureSource ?? "observation",
    endpoint: source.endpoint ?? null,
    sellers,
  });
}

export function readIncomingDocument(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (isObservationRecord(value)) return { kind: "observation", snapshot: snapshotFromObservation(value), observation: value };
  return { kind: "snapshot", snapshot: value, observation: observationRecordFromSnapshot(value) };
}

export function readObservation(dataDir) {
  const path = observationPath(dataDir);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeObservation(dataDir, observation) {
  mkdirSync(dataDir, { recursive: true });
  const path = observationPath(dataDir);
  writeFileSync(path, `${JSON.stringify(observation, null, 2)}\n`);
  return path;
}

function humanizeValue(value) {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

export function formatHumanChangelogSection(changes, { observedAt, captureSource = "live" } = {}) {
  if (!changes.length) return "";
  const byRoute = new Map();
  for (const change of changes) {
    if (!byRoute.has(change.route)) byRoute.set(change.route, []);
    byRoute.get(change.route).push(change);
  }
  const lines = [`## ${observedAt} (${captureSource})`, ""];
  for (const [route, rows] of [...byRoute.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const source = rows[0].source || CDP_DISCOVERY_SOURCE;
    lines.push(`- \`${route}\` (${source})`);
    for (const row of rows) {
      lines.push(`  - \`${row.field}\`: ${humanizeValue(row.before)} → ${humanizeValue(row.after)}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function appendHumanChangelog(dataDir, changes, { observedAt, captureSource = "live" } = {}) {
  const path = humanChangelogPath(dataDir);
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(path)) writeFileSync(path, HUMAN_CHANGELOG_HEADER);
  const section = formatHumanChangelogSection(changes, { observedAt, captureSource });
  if (section) appendFileSync(path, section);
  return path;
}

export function readbackReport(dataDir) {
  const observation = readObservation(dataDir);
  const changelog = readChangelog(dataDir);
  const mdPath = humanChangelogPath(dataDir);
  const cdp = observation?.sources?.[CDP_DISCOVERY_SOURCE] ?? null;
  return {
    ok: Boolean(observation),
    cron: false,
    daemon: false,
    observedAt: observation?.observedAt ?? null,
    observationPath: observation ? observationPath(dataDir) : null,
    humanChangelogPath: existsSync(mdPath) ? mdPath : null,
    changelogPath: existsSync(changelogPath(dataDir)) ? changelogPath(dataDir) : null,
    schema: observation?.schema ?? null,
    sources: Object.keys(observation?.sources ?? {}),
    sellerCount: cdp?.sellerCount ?? 0,
    routeCount: cdp?.routeCount ?? 0,
    changeCount: changelog.length,
    sellers: Object.values(cdp?.sellers ?? {}).map((seller) => ({
      id: seller.id,
      name: seller.name,
      rowCount: seller.rowCount,
      partial: seller.partial,
    })),
  };
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

export function isFullDiscoverySnapshot(snapshot) {
  return Boolean(
    snapshot
    && Array.isArray(snapshot.rows)
    && snapshot.rows.some((row) => row?.extensions && typeof row.extensions === "object" && !row.extensionsDigest),
  );
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
  incomingObservation = null,
} = {}) {
  mkdirSync(join(dataDir, "snapshots"), { recursive: true });
  const current = incomingSnapshot
    ? { ...incomingSnapshot, observedAt, source: incomingSnapshot.source ?? source, rowCount: incomingSnapshot.rows.length }
    : incomingObservation
      ? { ...snapshotFromObservation(incomingObservation), observedAt, source: incomingObservation.captureSource ?? source }
      : await collectCohortSnapshot(cohort, fetchImpl, { observedAt, source });

  const snapshotPath = writeSnapshot(dataDir, current);
  const previousPath = previousSnapshotPath(dataDir, snapshotFilename(current.observedAt));
  const previousSnapshot = previousPath ? readSnapshot(previousPath) : null;
  const currentObservation = incomingObservation
    ? { ...incomingObservation, observedAt, captureSource: incomingObservation.captureSource ?? source }
    : observationRecordFromSnapshot(current);
  const previousObservation = readObservation(dataDir);

  let changes;
  if (previousSnapshot && isFullDiscoverySnapshot(previousSnapshot) && isFullDiscoverySnapshot(current)) {
    changes = diffSnapshots(previousSnapshot, current, observedAt).map((change) => ({
      ...change,
      source: change.source ?? CDP_DISCOVERY_SOURCE,
    }));
  } else if (previousObservation) {
    changes = diffObservations(previousObservation, currentObservation, observedAt);
  } else {
    changes = [];
  }

  const observationFile = writeObservation(dataDir, currentObservation);
  const logPath = appendChangelog(dataDir, changes);
  const humanLogPath = appendHumanChangelog(dataDir, changes, {
    observedAt,
    captureSource: current.source ?? source,
  });

  return {
    ok: true,
    observedAt,
    snapshotPath,
    previousSnapshotPath: previousPath,
    observationPath: observationFile,
    changelogPath: logPath,
    humanChangelogPath: humanLogPath,
    rowCount: current.rows.length,
    sellerCount: current.sellers?.length ?? cohort.sellers.length,
    changeCount: changes.length,
    changes,
    snapshot: current,
    observation: currentObservation,
  };
}
