#!/usr/bin/env node
/**
 * One-shot observatory snapshot + delta CLI.
 *
 * Writes dated local JSON captures. No database, no polling loop, no heartbeat.
 * Does not reimplement source adapters; it consumes the SDS observatory registry
 * or HTTP GET against a local /api/observatory mount.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { SCHEMA_VERSION as CONTRACT_SCHEMA_VERSION, WITHHELD_CONCLUSIONS as CONTRACT_WITHHELD } from "../lib/observatory/contract.js";
import { USER_AGENT } from "../lib/observatory/bounded-fetch.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SDS_ROOT = resolve(here, "../..");
export const DEFAULT_REGISTRY_PATH = resolve(here, "../lib/observatory/registry.js");
export const DEFAULT_OUT_DIR = resolve(SDS_ROOT, "proofs/observatory-captures");
export const DEFAULT_HTTP_PREFIX = "/api/observatory";
export const CLI_USER_AGENT = USER_AGENT;

export const OBSERVATORY_SCHEMA_VERSION = CONTRACT_SCHEMA_VERSION;
export const CAPTURE_SCHEMA_VERSION = "pilot.external-observatory.capture.v1";
export const DELTA_SCHEMA_VERSION = "pilot.external-observatory.delta.v1";

export const WITHHELD_DELTA_CONCLUSIONS = Object.freeze([
  ...new Set([
    ...CONTRACT_WITHHELD,
    "traffic_growth",
    "continuity",
    "growth_rate",
    "percent_change_as_growth",
    "cross_source_sum",
  ]),
]);

const HELP = `Observatory snapshot + delta (one-shot local JSON; no DB, no daemon).

Usage:
  node server/scripts/observatory-capture.mjs capture --out <dir> [--base <url>] [--source <id>] [--now <iso>] [--label live|fixture]
  node server/scripts/observatory-capture.mjs delta --a <captureA> --b <captureB> [--out <file>]

capture  Fetch each named source via the SDS registry, or HTTP GET a local
         /api/observatory mount (--base). Writes YYYYMMDDTHHMMSSZ/<sourceId>.json
         plus manifest.json with fetchedAt and the source list.
delta    Compare two capture directories source-by-source. Reports added,
         removed, and changed metrics with prior/next values. Missing baseline
         is an explicit error. Unknown cadence is not invented as continuity
         or a growth rate. Never emits percent change as traffic growth.

--base <url>     Local observatory mount, e.g. http://127.0.0.1:3541
--source <id>    Limit capture to named sourceId (repeatable)
--label          live or fixture; live evidence belongs under proofs/
--now <iso>      Pin observer clock (tests)
`;

export function formatCaptureId(date = new Date()) {
  const iso = toIso(date);
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function toIso(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw codedError("invalid_time", `invalid time: ${value}`);
    }
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw codedError("invalid_time", `invalid time: ${value}`);
    }
    return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

export function sanitizeSourceId(id) {
  const text = String(id ?? "");
  if (!/^[A-Za-z0-9._-]+$/.test(text)) {
    throw codedError("invalid_source_id", `invalid sourceId for filename: ${id}`);
  }
  return text;
}

export function codedError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  for (const [key, value] of Object.entries(extra)) error[key] = value;
  return error;
}

export function assertUniqueSourceIds(ids, context) {
  const counts = new Map();
  for (const id of ids) {
    const key = String(id ?? "");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicates.length) {
    throw codedError(
      "duplicate_source_ids",
      `duplicate source ids${context ? ` in ${context}` : ""}: ${duplicates.join(", ")}`,
      { duplicates, context },
    );
  }
}

export function normalizeSourceMeta(entry) {
  if (typeof entry === "string") return { sourceId: sanitizeSourceId(entry) };
  if (!isPlainObject(entry)) {
    throw codedError("invalid_source_list", "source list entry is not an object");
  }
  const sourceId = entry.sourceId || entry.id;
  if (!sourceId) {
    throw codedError("invalid_source_list", "source list entry missing sourceId");
  }
  return {
    sourceId: sanitizeSourceId(sourceId),
    sourceKind: entry.sourceKind ?? entry.kind ?? null,
    upstreamUrl: entry.upstreamUrl ?? entry.url ?? null,
  };
}

export function normalizeSourceList(payload) {
  if (Array.isArray(payload)) return payload.map(normalizeSourceMeta);
  if (isPlainObject(payload) && Array.isArray(payload.sources)) {
    return payload.sources.map((entry) => {
      if (isPlainObject(entry) && isPlainObject(entry.envelope)) {
        return normalizeSourceMeta({ ...entry, ...entry.envelope });
      }
      return normalizeSourceMeta(entry);
    });
  }
  throw codedError("invalid_source_list", "source list missing");
}

export function extractObservations(payload) {
  if (Array.isArray(payload)) return payload;
  if (isPlainObject(payload) && Array.isArray(payload.observations)) return payload.observations;
  if (isPlainObject(payload) && Array.isArray(payload.sources)) {
    return payload.sources.map((entry) => {
      if (isPlainObject(entry) && isPlainObject(entry.envelope)) return entry.envelope;
      if (isPlainObject(entry) && Array.isArray(entry.metrics) && entry.sourceId) return entry;
      throw codedError("invalid_snapshot", "snapshot source is not an observation envelope");
    });
  }
  throw codedError("invalid_snapshot", "snapshot has no observations");
}

export function wrapRegistryModule(mod, runtimeOptions = {}) {
  if (!mod || typeof mod !== "object") {
    throw codedError("registry_invalid", "registry module is not an object");
  }
  if (typeof mod.createObservatoryRuntime === "function") {
    return wrapRuntime(mod.createObservatoryRuntime(runtimeOptions));
  }
  const root = isPlainObject(mod.registry) ? mod.registry : mod;
  if (typeof root.createObservatoryRuntime === "function") {
    return wrapRuntime(root.createObservatoryRuntime(runtimeOptions));
  }
  const listFn = firstFn(root, ["listSources", "list", "sources"]);
  const getFn = firstFn(root, ["getSource", "get"]);
  const observeFn = firstFn(root, ["observeSource", "observe", "fetchSource"]);
  const allFn = firstFn(root, ["observeAll", "snapshot", "observeSnapshot"]);

  const api = {
    async listSources() {
      if (listFn) return listFn();
      if (Array.isArray(root.SOURCES)) return root.SOURCES;
      if (Array.isArray(mod.SOURCES)) return mod.SOURCES;
      throw codedError("registry_invalid", "registry has no listSources()");
    },
    getSource(id) {
      if (getFn) return getFn(id);
      return null;
    },
    async observe(id, options) {
      if (observeFn) return observeFn(id, options);
      throw codedError(
        "registry_invalid",
        `registry cannot observe ${id}; expected createObservatoryRuntime().observe`,
      );
    },
    async observeAll(options) {
      if (allFn) return allFn(options);
      const listed = normalizeSourceList(await api.listSources());
      assertUniqueSourceIds(listed.map((row) => row.sourceId), "registry.listSources");
      const wanted = options?.sourceIds;
      const selected = wanted?.length
        ? listed.filter((row) => wanted.includes(row.sourceId))
        : listed;
      return Promise.all(selected.map((row) => api.observe(row.sourceId, options)));
    },
  };
  return api;
}

export function wrapRuntime(runtime) {
  if (!runtime || typeof runtime.observe !== "function") {
    throw codedError("registry_invalid", "observatory runtime has no observe()");
  }
  return {
    async listSources() {
      if (typeof runtime.listCatalog === "function") {
        const catalog = runtime.listCatalog();
        if (catalog && Array.isArray(catalog.sources)) return catalog.sources;
      }
      if (typeof runtime.listSources === "function") return runtime.listSources();
      throw codedError("registry_invalid", "runtime has no listSources()");
    },
    getSource(id) {
      if (typeof runtime.getSource === "function") return runtime.getSource(id);
      return null;
    },
    async observe(id) {
      return runtime.observe(id);
    },
    async observeAll() {
      if (typeof runtime.observeAll === "function") return runtime.observeAll();
      const listed = normalizeSourceList(await this.listSources());
      return Promise.all(listed.map((row) => runtime.observe(row.sourceId)));
    },
  };
}

export async function importRegistry(registryPath = DEFAULT_REGISTRY_PATH, runtimeOptions = {}) {
  const resolved = resolve(registryPath);
  if (!existsSync(resolved)) {
    throw codedError("registry_missing", `observatory registry not found: ${resolved}`);
  }
  const mod = await import(pathToFileURL(resolved).href);
  return wrapRegistryModule(mod, runtimeOptions);
}

export function createHttpRegistry(base, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const root = String(base || "").replace(/\/$/, "");
  if (!root) throw codedError("invalid_base", "HTTP observatory --base is empty");
  const prefix = options.prefix || DEFAULT_HTTP_PREFIX;

  async function getJson(path) {
    const headers = {
      Accept: "application/json",
      "User-Agent": CLI_USER_AGENT,
    };
    assertNoForwardedSecrets(headers);
    const response = await fetchImpl(`${root}${path}`, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
    });
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      throw codedError("http_error", `HTTP ${response.status} for ${path}`, {
        httpStatus: response.status,
        body,
      });
    }
    return body;
  }

  const api = {
    async listSources() {
      return normalizeSourceList(await getJson(`${prefix}/sources`));
    },
    async observe(id) {
      return getJson(`${prefix}/sources/${encodeURIComponent(id)}`);
    },
    async observeAll(observeOptions = {}) {
      const wanted = observeOptions.sourceIds;
      if (!wanted?.length) {
        try {
          return extractObservations(await getJson(`${prefix}/snapshot`));
        } catch (error) {
          if (error?.code !== "http_error" && error?.code !== "invalid_snapshot") throw error;
        }
      }
      const listed = await api.listSources();
      assertUniqueSourceIds(listed.map((row) => row.sourceId), "http /sources");
      const selected = wanted?.length
        ? listed.filter((row) => wanted.includes(row.sourceId))
        : listed;
      return Promise.all(selected.map((row) => api.observe(row.sourceId)));
    },
  };
  return api;
}

export function createFixtureRegistry(envelopes, listOverride) {
  const list = listOverride || envelopes.map((row) => ({
    sourceId: row.sourceId,
    sourceKind: row.sourceKind ?? null,
    upstreamUrl: row.upstreamUrl ?? null,
  }));
  const byId = new Map(envelopes.map((row) => [row.sourceId, row]));
  return {
    listSources() {
      return list;
    },
    getSource(id) {
      const envelope = byId.get(id);
      if (!envelope) return null;
      return {
        sourceId: id,
        observe() {
          return envelope;
        },
      };
    },
    async observe(id) {
      if (!byId.has(id)) throw codedError("unknown_source", `unknown sourceId: ${id}`);
      return byId.get(id);
    },
  };
}

export async function resolveClient(options = {}) {
  const runtimeOptions = runtimeOptionsFrom(options);
  if (options.registry) {
    if (typeof options.registry.createObservatoryRuntime === "function") {
      return wrapRegistryModule(options.registry, runtimeOptions);
    }
    if (typeof options.registry.observe === "function" && typeof options.registry.listSources === "function") {
      return options.registry;
    }
    return wrapRegistryModule(options.registry, runtimeOptions);
  }
  if (options.base) {
    return createHttpRegistry(options.base, { fetchImpl: options.fetchImpl });
  }
  const envBase = options.env?.OBSERVATORY_BASE || process.env.OBSERVATORY_BASE;
  if (envBase) {
    return createHttpRegistry(envBase, { fetchImpl: options.fetchImpl });
  }
  return importRegistry(options.registryPath || DEFAULT_REGISTRY_PATH, runtimeOptions);
}

function runtimeOptionsFrom(options) {
  const runtime = {};
  if (options.fetcher) runtime.fetcher = options.fetcher;
  if (options.fetchImpl) runtime.fetchImpl = options.fetchImpl;
  if (typeof options.now === "function") runtime.now = options.now;
  else if (options.now != null) {
    const ms = typeof options.now === "number" ? options.now : Date.parse(toIso(options.now));
    if (Number.isFinite(ms)) runtime.now = () => ms;
  }
  if (options.timeoutMs != null) runtime.timeoutMs = options.timeoutMs;
  if (options.cacheTtlMs != null) runtime.cacheTtlMs = options.cacheTtlMs;
  return runtime;
}

export function errorEnvelope(sourceId, error, fetchedAt) {
  return {
    schemaVersion: OBSERVATORY_SCHEMA_VERSION,
    sourceId,
    sourceKind: null,
    upstreamUrl: null,
    fetchedAt,
    providerTimestamp: null,
    providerTimestampState: "missing",
    availability: "error",
    httpStatus: error?.httpStatus ?? null,
    cache: { hit: false, ageMs: null, stale: false, ttlMs: null, fetchedAt },
    metrics: [],
    coverage: { kind: "point_snapshot", complete: false },
    errors: [
      {
        code: error?.code || "observe_failed",
        message: error && error.message ? error.message : "observe failed",
      },
    ],
    warnings: [],
    evidenceClass: "error",
    withheldConclusions: WITHHELD_DELTA_CONCLUSIONS,
  };
}

export async function collectObservations(client, options = {}) {
  const fetchedAt = options.fetchedAt || toIso(options.now || new Date());
  const wanted = options.sourceIds;
  const listed = normalizeSourceList(await client.listSources());
  assertUniqueSourceIds(listed.map((row) => row.sourceId), "listSources");
  if (wanted?.length) {
    const known = new Set(listed.map((row) => row.sourceId));
    for (const id of wanted) {
      if (!known.has(id)) throw codedError("unknown_source", `unknown sourceId: ${id}`);
    }
  }
  const selected = wanted?.length
    ? listed.filter((row) => wanted.includes(row.sourceId))
    : listed;

  let raw;
  if (!wanted?.length && typeof client.observeAll === "function") {
    try {
      raw = await client.observeAll({ ...options, sourceIds: wanted });
    } catch {
      raw = null;
    }
  }
  if (!raw) {
    raw = await Promise.all(
      selected.map(async (row) => {
        try {
          return await client.observe(row.sourceId, options);
        } catch (error) {
          return errorEnvelope(row.sourceId, error, fetchedAt);
        }
      }),
    );
  }

  const observations = (Array.isArray(raw) ? raw : extractObservations(raw)).map((row) =>
    normalizeObservation(row, fetchedAt),
  );
  if (wanted?.length) {
    return observations.filter((row) => wanted.includes(row.sourceId));
  }
  assertUniqueSourceIds(observations.map((row) => row.sourceId), "capture observations");
  return observations;
}

export function normalizeObservation(row, fetchedAt) {
  if (!isPlainObject(row)) {
    throw codedError("invalid_observation", "observation is not an object");
  }
  const sourceId = sanitizeSourceId(row.sourceId || row.id);
  return {
    ...row,
    schemaVersion: row.schemaVersion || OBSERVATORY_SCHEMA_VERSION,
    sourceId,
    sourceKind: row.sourceKind ?? null,
    upstreamUrl: row.upstreamUrl ?? null,
    fetchedAt: row.fetchedAt || fetchedAt,
    providerTimestamp: row.providerTimestamp ?? row.sourceTime ?? null,
    providerTimestampState: row.providerTimestampState ?? row.sourceTimeState ?? "missing",
    availability: row.availability ?? "error",
    httpStatus: row.httpStatus ?? null,
    cache: row.cache ?? null,
    metrics: Array.isArray(row.metrics) ? row.metrics : [],
    coverage: row.coverage ?? null,
    errors: Array.isArray(row.errors) ? row.errors : row.error ? [row.error] : [],
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    evidenceClass: row.evidenceClass ?? null,
    rawSourceLink: row.rawSourceLink ?? row.upstreamUrl ?? null,
    withheldConclusions: row.withheldConclusions ?? WITHHELD_DELTA_CONCLUSIONS,
  };
}

export async function writeCapture(outDir, observations, options = {}) {
  const now = options.now != null ? new Date(options.now) : new Date();
  const fetchedAt = options.fetchedAt || toIso(now);
  const captureId = options.captureId || formatCaptureId(now);
  const dest = join(resolve(outDir), captureId);
  await mkdir(dest, { recursive: true });

  assertUniqueSourceIds(observations.map((row) => row.sourceId), "capture observations");

  const sources = [];
  for (const observation of observations) {
    const file = `${sanitizeSourceId(observation.sourceId)}.json`;
    await writeFile(join(dest, file), `${JSON.stringify(observation, null, 2)}\n`);
    sources.push({
      sourceId: observation.sourceId,
      sourceKind: observation.sourceKind ?? null,
      file,
      availability: observation.availability ?? null,
      httpStatus: observation.httpStatus ?? null,
      providerTimestamp: observation.providerTimestamp ?? null,
      providerTimestampState: observation.providerTimestampState ?? null,
    });
  }

  const label = options.label || "unspecified";
  const manifest = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureId,
    fetchedAt,
    label,
    evidenceClass: options.evidenceClass || evidenceClassForLabel(label),
    polling: false,
    heartbeat: false,
    database: false,
    sourceCount: sources.length,
    sources,
  };
  await writeFile(join(dest, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir: dest, manifest, observations };
}

export async function runCapture(options = {}) {
  const outDir = options.out || DEFAULT_OUT_DIR;
  const now = options.now || new Date();
  const fetchedAt = toIso(now);
  const client = await resolveClient(options);
  const sourceIds = asList(options.source || options.sourceIds);
  const observations = await collectObservations(client, {
    fetchedAt,
    now,
    sourceIds: sourceIds.length ? sourceIds : undefined,
  });
  return writeCapture(outDir, observations, {
    now,
    fetchedAt,
    label: options.label,
    evidenceClass: options.evidenceClass,
  });
}

export function loadCapture(dir, { role = "capture" } = {}) {
  const missingCode = role === "baseline" ? "baseline_missing" : "capture_missing";
  const missingLabel = role === "baseline" ? "baseline missing" : "capture missing";
  if (dir == null || dir === "") {
    throw codedError(missingCode, missingLabel);
  }
  const resolved = resolve(dir);
  const manifestPath = join(resolved, "manifest.json");
  if (!existsSync(resolved) || !statSync(resolved).isDirectory() || !existsSync(manifestPath)) {
    throw codedError(missingCode, `${missingLabel}: ${resolved}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw codedError("invalid_manifest", `invalid manifest.json in ${resolved}: ${error.message}`);
  }
  if (!isPlainObject(manifest) || !Array.isArray(manifest.sources)) {
    throw codedError("invalid_manifest", `manifest.json in ${resolved} has no sources list`);
  }
  assertUniqueSourceIds(manifest.sources.map((row) => row.sourceId), `${role} manifest`);

  const observations = manifest.sources.map((row) => {
    const fileName = row.file || `${row.sourceId}.json`;
    const filePath = join(resolved, fileName);
    if (!existsSync(filePath)) {
      return errorEnvelope(
        row.sourceId,
        codedError("source_file_missing", `source file missing: ${fileName}`),
        manifest.fetchedAt,
      );
    }
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return normalizeObservation(parsed, manifest.fetchedAt);
  });

  const extra = readdirSync(resolved).filter((name) => (
    name.endsWith(".json") && name !== "manifest.json"
    && !manifest.sources.some((row) => (row.file || `${row.sourceId}.json`) === name)
  ));
  if (extra.length) {
    throw codedError(
      "invalid_capture",
      `capture ${resolved} has JSON files not listed in manifest: ${extra.join(", ")}`,
    );
  }

  assertUniqueSourceIds(observations.map((row) => row.sourceId), `${role} capture`);
  return {
    dir: resolved,
    manifest,
    observations,
    bySourceId: Object.fromEntries(observations.map((row) => [row.sourceId, row])),
  };
}

export function compareMetrics(priorList, nextList) {
  const priorMap = indexMetrics(priorList, "prior");
  const nextMap = indexMetrics(nextList, "next");
  const keys = [...new Set([...priorMap.keys(), ...nextMap.keys()])].sort();
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  const definitionChanged = [];

  for (const key of keys) {
    const prior = priorMap.get(key);
    const next = nextMap.get(key);
    if (!prior) {
      added.push({ key, next: metricView(next) });
      continue;
    }
    if (!next) {
      removed.push({ key, prior: metricView(prior) });
      continue;
    }
    const defChanged = definitionFingerprint(prior) !== definitionFingerprint(next);
    const valueChanged = !sameJson(metricValueView(prior), metricValueView(next));
    if (defChanged) {
      const row = {
        key,
        prior: metricView(prior),
        next: metricView(next),
        definitionChanged: true,
        comparable: false,
        reason: "definition_changed",
      };
      definitionChanged.push(row);
      changed.push(row);
      continue;
    }
    if (valueChanged) {
      changed.push({
        key,
        prior: metricView(prior),
        next: metricView(next),
        definitionChanged: false,
        comparable: prior.state === "ok" && next.state === "ok",
      });
      continue;
    }
    unchanged.push({ key });
  }

  return { added, removed, changed, unchanged, definitionChanged };
}

export function compareCaptures(a, b) {
  const allIds = [...new Set([
    ...a.observations.map((row) => row.sourceId),
    ...b.observations.map((row) => row.sourceId),
  ])].sort();

  const sources = [];
  let anyWindowPresent = false;

  for (const sourceId of allIds) {
    const prior = a.bySourceId[sourceId];
    const next = b.bySourceId[sourceId];
    if (!prior) {
      sources.push({
        sourceId,
        status: "added",
        next: sourceSummary(next),
        metrics: {
          added: (next.metrics || []).map((metric) => ({ key: metric.key, next: metricView(metric) })),
          removed: [],
          changed: [],
          unchanged: [],
          definitionChanged: [],
        },
      });
      continue;
    }
    if (!next) {
      sources.push({
        sourceId,
        status: "removed",
        prior: sourceSummary(prior),
        metrics: {
          added: [],
          removed: (prior.metrics || []).map((metric) => ({ key: metric.key, prior: metricView(metric) })),
          changed: [],
          unchanged: [],
          definitionChanged: [],
        },
      });
      continue;
    }

    const cadence = cadenceState(prior, next);
    if (cadence.windowPresent) anyWindowPresent = true;
    const metrics = compareMetrics(prior.metrics || [], next.metrics || []);
    sources.push({
      sourceId,
      status: "compared",
      availability: { prior: prior.availability ?? null, next: next.availability ?? null },
      providerTimestampState: {
        prior: prior.providerTimestampState ?? null,
        next: next.providerTimestampState ?? null,
      },
      providerTimestamp: {
        prior: prior.providerTimestamp ?? null,
        next: next.providerTimestamp ?? null,
      },
      fetchedAt: { prior: prior.fetchedAt ?? null, next: next.fetchedAt ?? null },
      cadence,
      metrics,
      warnings: sourceWarnings(prior, next, cadence),
    });
  }

  const cadenceKnown = false;
  return {
    schemaVersion: DELTA_SCHEMA_VERSION,
    a: captureRef(a),
    b: captureRef(b),
    observerIntervalMs: intervalMs(a.manifest.fetchedAt, b.manifest.fetchedAt),
    providerCadenceKnown: cadenceKnown,
    windowPresent: anyWindowPresent,
    continuity: {
      invented: false,
      reason: "cadence_unknown",
    },
    growth: {
      invented: false,
      trafficGrowth: null,
      percentChange: null,
      charts: [],
    },
    withheldConclusions: WITHHELD_DELTA_CONCLUSIONS,
    sources,
  };
}

export function runDelta(options = {}) {
  const a = loadCapture(options.a, { role: "baseline" });
  const b = loadCapture(options.b, { role: "next" });
  return compareCaptures(a, b);
}

export async function runCli(argv, options = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        out: { type: "string" },
        a: { type: "string" },
        b: { type: "string" },
        base: { type: "string" },
        source: { type: "string", multiple: true },
        now: { type: "string" },
        label: { type: "string" },
        registry: { type: "string" },
        help: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    const stderr = `${error.message}\n`;
    options.stderr?.(stderr);
    return { code: 2, stdout: "", stderr };
  }

  const { values, positionals } = parsed;
  const cmd = positionals[0];
  const stdoutChunks = [];
  const stderrChunks = [];
  const writeOut = options.stdout || ((chunk) => stdoutChunks.push(chunk));
  const writeErr = options.stderr || ((chunk) => stderrChunks.push(chunk));

  if (values.help || !cmd) {
    writeErr(HELP);
    return finish(values.help ? 0 : 2, stdoutChunks, stderrChunks);
  }

  try {
    if (cmd === "capture") {
      if (!values.out) {
        writeErr("capture requires --out <dir>\n");
        return finish(2, stdoutChunks, stderrChunks);
      }
      const result = await runCapture({
        out: values.out,
        base: values.base,
        source: values.source,
        now: values.now,
        label: values.label,
        registryPath: values.registry,
        registry: options.registry,
        fetchImpl: options.fetchImpl,
        env: options.env,
      });
      writeOut(`${JSON.stringify({
        ok: true,
        command: "capture",
        dir: result.dir,
        captureId: result.manifest.captureId,
        fetchedAt: result.manifest.fetchedAt,
        label: result.manifest.label,
        evidenceClass: result.manifest.evidenceClass,
        sources: result.manifest.sources.map((row) => row.sourceId),
      }, null, 2)}\n`);
      return finish(0, stdoutChunks, stderrChunks, result);
    }

    if (cmd === "delta") {
      if (values.a == null || values.a === "") {
        throw codedError("baseline_missing", "baseline missing: --a is required");
      }
      if (values.b == null || values.b === "") {
        throw codedError("capture_missing", "capture missing: --b is required");
      }
      const result = runDelta({ a: values.a, b: values.b });
      const text = `${JSON.stringify(result, null, 2)}\n`;
      writeOut(text);
      if (values.out) {
        await writeFile(resolve(values.out), text);
      }
      return finish(0, stdoutChunks, stderrChunks, result);
    }

    writeErr(`unknown command: ${cmd}\n${HELP}`);
    return finish(2, stdoutChunks, stderrChunks);
  } catch (error) {
    const payload = {
      ok: false,
      error: error.code || "error",
      message: error.message,
      ...(error.duplicates ? { duplicates: error.duplicates } : {}),
    };
    writeErr(`${JSON.stringify(payload, null, 2)}\n`);
    const code = error.code === "baseline_missing"
      || error.code === "duplicate_source_ids"
      || error.code === "capture_missing"
      || error.code === "unknown_source"
      ? 2
      : 1;
    return finish(code, stdoutChunks, stderrChunks, undefined, error);
  }
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const streamed = {
    stdout: (chunk) => process.stdout.write(chunk),
    stderr: (chunk) => process.stderr.write(chunk),
  };
  const { code } = await runCli(process.argv.slice(2), streamed);
  process.exit(code);
}

function finish(code, stdoutChunks, stderrChunks, result, error) {
  return {
    code,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    result,
    error,
  };
}

function evidenceClassForLabel(label) {
  if (label === "live") return "live";
  if (label === "fixture") return "fixture";
  return "unspecified";
}

function asList(value) {
  if (value == null || value === false) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function firstFn(object, names) {
  for (const name of names) {
    if (typeof object[name] === "function") return object[name].bind(object);
  }
  return null;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertNoForwardedSecrets(headers) {
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "cookie" || lower === "cookie2" || lower === "proxy-authorization") {
      throw codedError("secret_forward_rejected", `refusing to forward ${key}`);
    }
  }
}

function indexMetrics(list, role) {
  const map = new Map();
  for (const metric of list || []) {
    if (!metric || typeof metric.key !== "string") continue;
    if (map.has(metric.key)) {
      throw codedError("duplicate_metric_keys", `duplicate metric key '${metric.key}' in ${role}`);
    }
    map.set(metric.key, metric);
  }
  return map;
}

function metricView(metric) {
  return {
    key: metric.key,
    value: metric.value ?? null,
    unit: metric.unit ?? null,
    state: metric.state ?? null,
    definition: metric.definition ?? null,
    population: metric.population ?? null,
    window: metric.window ?? null,
  };
}

function metricValueView(metric) {
  return {
    value: metric.value ?? null,
    state: metric.state ?? null,
    unit: metric.unit ?? null,
  };
}

function definitionFingerprint(metric) {
  return stableJson({
    definition: metric.definition ?? null,
    unit: metric.unit ?? null,
    population: metric.population ?? null,
    window: metric.window ?? null,
  });
}

function cadenceState(prior, next) {
  const priorWindow = collectWindows(prior);
  const nextWindow = collectWindows(next);
  const windowPresent = priorWindow.length > 0 || nextWindow.length > 0;
  return {
    known: false,
    reason: "cadence_unknown",
    windowPresent,
    priorWindows: priorWindow,
    nextWindows: nextWindow,
    inventedContinuity: false,
    inventedGrowthRate: false,
  };
}

function collectWindows(observation) {
  const found = [];
  const seen = new Set();
  const push = (value) => {
    if (value == null || value === "" || value === "unspecified" || value === "unknown") return;
    const key = stableJson(value);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(value);
  };
  push(observation?.coverage?.window);
  for (const metric of observation?.metrics || []) push(metric.window);
  return found;
}

function sourceWarnings(prior, next, cadence) {
  const warnings = [];
  if (prior.availability !== next.availability) {
    warnings.push({
      code: "availability_changed",
      prior: prior.availability ?? null,
      next: next.availability ?? null,
    });
  }
  if (prior.providerTimestampState !== next.providerTimestampState) {
    warnings.push({
      code: "provider_timestamp_state_changed",
      prior: prior.providerTimestampState ?? null,
      next: next.providerTimestampState ?? null,
    });
  }
  if (!cadence.known) {
    warnings.push({
      code: "cadence_unknown",
      message: "cadence unknown; not inventing continuity or growth rates",
    });
  }
  if (next.availability === "partial" || prior.availability === "partial") {
    warnings.push({
      code: "partial_availability",
      message: "partial availability is not a zero total and is not traffic growth",
    });
  }
  if (next.availability === "stale" || prior.availability === "stale"
    || next.providerTimestampState === "stale" || prior.providerTimestampState === "stale") {
    warnings.push({
      code: "stale_observation",
      message: "stale provider clock is not rewritten as a fresh zero or a growth rate",
    });
  }
  return warnings;
}

function sourceSummary(observation) {
  return {
    sourceId: observation.sourceId,
    availability: observation.availability ?? null,
    providerTimestampState: observation.providerTimestampState ?? null,
    fetchedAt: observation.fetchedAt ?? null,
  };
}

function captureRef(capture) {
  return {
    path: capture.dir,
    captureId: capture.manifest.captureId,
    fetchedAt: capture.manifest.fetchedAt,
    label: capture.manifest.label ?? null,
    evidenceClass: capture.manifest.evidenceClass ?? null,
  };
}

function intervalMs(a, b) {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return right - left;
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}
