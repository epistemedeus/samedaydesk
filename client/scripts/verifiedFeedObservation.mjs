import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crawl from "../src/data/sellerConformanceCrawl.json" with { type: "json" };
import {
  SAMEDAYDESK_ORIGIN,
  SAMEDAYDESK_SELLER,
  isSingleNetworkIdentifier,
} from "./generateVerifiedFeed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_X402_MANIFEST_FIXTURE = path.join(
  here,
  "../../fixtures/presence/catalog/x402.json",
);
export const DEFAULT_OBSERVATION_FIXTURE_DIR = path.join(
  here,
  "../../fixtures/verified-feed/observations",
);

export const ALLOWED_ORIGIN = SAMEDAYDESK_ORIGIN;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_BYTES = 256_000;
export const DEFAULT_CONCURRENCY = 1;
export const DEFAULT_LIVE_ROUTE_LIMIT = 1;
export const USER_AGENT = "samedaydesk-verified-feed-refresh/1.0";

export const OBSERVATION_STATUSES = Object.freeze([
  "current",
  "stale",
  "unknown",
  "failed",
]);

export function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "[::1]" || host === "::1") return true;
  if (host === "metadata.google.internal") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function routeKey(method, origin, route) {
  return `${method} ${origin}${route}`;
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashContract(parts) {
  return createHash("sha256").update(stableStringify(parts)).digest("hex");
}

export function loadAllowlistedProbeUrls(manifestPath = DEFAULT_X402_MANIFEST_FIXTURE, source = crawl) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const allowed = new Map(
    (source.routes || []).map((row) => [routeKey(row.method, row.origin, row.route), row]),
  );
  const probes = [];
  for (const item of manifest.items || []) {
    const method = String(item?.request?.method || "").toUpperCase();
    const route = item?.resource?.routeTemplate;
    const origin = ALLOWED_ORIGIN;
    const exampleUrl = item?.request?.exampleUrl;
    if (!route || !exampleUrl) continue;
    const key = routeKey(method, origin, route);
    const crawlRow = allowed.get(key);
    if (!crawlRow) continue;
    if (crawlRow.seller !== SAMEDAYDESK_SELLER || crawlRow.origin !== ALLOWED_ORIGIN) continue;
    probes.push({
      key,
      method,
      origin,
      route,
      exampleUrl,
      crawlRow,
    });
  }
  return probes;
}

export function assertAllowlistedUrl(urlString, allowlist) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`invalid probe URL: ${urlString}`);
  }
  if (url.protocol !== "https:") throw new Error(`refusing non-https probe: ${urlString}`);
  if (url.username || url.password) throw new Error(`refusing credentialed probe: ${urlString}`);
  if (isBlockedHost(url.hostname)) throw new Error(`refusing private/metadata host: ${url.hostname}`);
  if (`${url.protocol}//${url.host}` !== ALLOWED_ORIGIN) {
    throw new Error(`refusing non-allowlisted origin: ${url.origin}`);
  }
  const pathname = url.pathname;
  const match = allowlist.find((row) => row.route === pathname && row.exampleUrl === urlString);
  if (!match) throw new Error(`refusing URL outside exact allowlisted example set: ${urlString}`);
  return url;
}

function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want) return value;
  }
  return null;
}

export function parseUnpaid402Payload({ status, headers, bodyText }) {
  if (status !== 402) {
    return { ok: false, failure: { kind: "http_status", detail: `status_${status}` } };
  }
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return { ok: false, failure: { kind: "invalid_json", detail: "body_not_json" } };
  }
  const accepts = Array.isArray(body?.accepts) ? body.accepts : null;
  if (!accepts || accepts.length === 0) {
    return { ok: false, failure: { kind: "invalid_json", detail: "missing_accepts" } };
  }
  const accept = accepts.find((row) => isSingleNetworkIdentifier(row?.network)) || accepts[0];
  const amount = String(accept?.amount ?? accept?.maxAmountRequired ?? "");
  const asset = typeof accept?.asset === "string" ? accept.asset : null;
  const network = typeof accept?.network === "string" ? accept.network : null;
  if (!/^[0-9]+$/.test(amount) || !asset || !isSingleNetworkIdentifier(network)) {
    return { ok: false, failure: { kind: "invalid_json", detail: "malformed_accept" } };
  }
  const example =
    body?.extensions?.bazaar?.info?.output?.example ||
    accept?.outputSchema?.output?.example ||
    {};
  const outputExampleKeys = Object.keys(example || {}).sort();
  const unpaid402OutputSchemaPresent =
    Boolean(body?.extensions?.bazaar?.schema) ||
    Boolean(accept?.outputSchema) ||
    outputExampleKeys.length > 0;
  const contractHash = hashContract({
    amount,
    asset,
    network,
    scheme: accept?.scheme || "exact",
    outputExampleKeys,
  });
  return {
    ok: true,
    observation: {
      unpaid402: {
        amount,
        network,
        asset,
        source: "live_unpaid_402",
      },
      outputExampleKeys,
      unpaid402OutputSchemaPresent,
      contractHash,
      paymentRequiredHeaderPresent: Boolean(headerGet(headers, "payment-required")),
    },
  };
}

export async function readBoundedBody(response, maxBytes = DEFAULT_MAX_BYTES) {
  if (typeof response.arrayBuffer === "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      return { ok: false, failure: { kind: "too_large", detail: `bytes_${buffer.length}` } };
    }
    return { ok: true, bodyText: buffer.toString("utf8") };
  }
  const bodyText = String(response.body ?? "");
  const bytes = Buffer.byteLength(bodyText, "utf8");
  if (bytes > maxBytes) {
    return { ok: false, failure: { kind: "too_large", detail: `bytes_${bytes}` } };
  }
  return { ok: true, bodyText };
}

export function observationFromPriorEvidence(crawlRow, asOf) {
  const priorAt = crawlRow?.lastVerified;
  const hasPrior =
    typeof priorAt === "string" &&
    crawlRow?.unpaid402?.source === "live_unpaid_402" &&
    typeof crawlRow?.contractHash === "string";
  if (!hasPrior) {
    return {
      key: routeKey(crawlRow.method, crawlRow.origin, crawlRow.route),
      method: crawlRow.method,
      origin: crawlRow.origin,
      route: crawlRow.route,
      status: "unknown",
      lastObservation: null,
      failure: null,
      asOf,
    };
  }
  const stale = priorAt !== asOf;
  return {
    key: routeKey(crawlRow.method, crawlRow.origin, crawlRow.route),
    method: crawlRow.method,
    origin: crawlRow.origin,
    route: crawlRow.route,
    status: stale ? "stale" : "current",
    lastObservation: {
      observedAt: priorAt,
      contractHash: crawlRow.contractHash,
      unpaid402: crawlRow.unpaid402,
      outputExampleKeys: crawlRow.outputExampleKeys || [],
      unpaid402OutputSchemaPresent: crawlRow.unpaid402OutputSchemaPresent === true,
      source: "prior_crawl_evidence",
    },
    failure: null,
    asOf,
  };
}

export function markFailedObservation(probe, asOf, failure) {
  return {
    key: probe.key,
    method: probe.method,
    origin: probe.origin,
    route: probe.route,
    status: "failed",
    lastObservation: null,
    failure: { ...failure, at: asOf },
    asOf,
  };
}

export function markCurrentObservation(probe, asOf, parsed) {
  return {
    key: probe.key,
    method: probe.method,
    origin: probe.origin,
    route: probe.route,
    status: "current",
    lastObservation: {
      observedAt: asOf,
      ...parsed,
      source: "live_or_fixture_observation",
    },
    failure: null,
    asOf,
  };
}

export async function observeProbe(probe, asOf, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    allowlist = [probe],
    redirect = "manual",
  } = options;

  try {
    assertAllowlistedUrl(probe.exampleUrl, allowlist);
  } catch (error) {
    return markFailedObservation(probe, asOf, {
      kind: "ssrf_blocked",
      detail: error.message,
    });
  }

  let response;
  try {
    response = await fetchImpl(probe.exampleUrl, {
      method: probe.method === "GET" ? "GET" : probe.method,
      redirect,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const kind = error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "network";
    return markFailedObservation(probe, asOf, {
      kind,
      detail: error?.message || String(error),
    });
  }

  if (response.status >= 300 && response.status < 400) {
    return markFailedObservation(probe, asOf, {
      kind: "redirect",
      detail: headerGet(response.headers, "location") || `status_${response.status}`,
    });
  }

  const body = await readBoundedBody(response, maxBytes);
  if (!body.ok) return markFailedObservation(probe, asOf, body.failure);

  const parsed = parseUnpaid402Payload({
    status: response.status,
    headers: response.headers,
    bodyText: body.bodyText,
  });
  if (!parsed.ok) return markFailedObservation(probe, asOf, parsed.failure);
  return markCurrentObservation(probe, asOf, parsed.observation);
}

export function loadObservationFixture(name, fixtureDir = DEFAULT_OBSERVATION_FIXTURE_DIR) {
  return JSON.parse(readFileSync(path.join(fixtureDir, `${name}.json`), "utf8"));
}

export function observationFromFixture(probe, asOf, fixture) {
  if (fixture.kind === "current") {
    const parsed = parseUnpaid402Payload({
      status: fixture.status,
      headers: fixture.headers || {},
      bodyText: typeof fixture.body === "string" ? fixture.body : JSON.stringify(fixture.body),
    });
    if (!parsed.ok) return markFailedObservation(probe, asOf, parsed.failure);
    return markCurrentObservation(probe, asOf, parsed.observation);
  }
  if (fixture.kind === "failed") {
    return markFailedObservation(probe, asOf, {
      kind: fixture.failureKind || "http_status",
      detail: fixture.detail || fixture.failureKind || "failed",
    });
  }
  if (fixture.kind === "redirect") {
    return markFailedObservation(probe, asOf, {
      kind: "redirect",
      detail: fixture.location || "redirect",
    });
  }
  if (fixture.kind === "timeout") {
    return markFailedObservation(probe, asOf, { kind: "timeout", detail: "timeout" });
  }
  if (fixture.kind === "invalid_json") {
    return markFailedObservation(probe, asOf, {
      kind: "invalid_json",
      detail: fixture.detail || "invalid_json",
    });
  }
  return markFailedObservation(probe, asOf, {
    kind: "invalid_json",
    detail: `unknown_fixture_kind:${fixture.kind}`,
  });
}

export async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function collectObservations({
  asOf,
  source = crawl,
  mode = "fixtures",
  fixtureMap = {},
  liveRouteLimit = DEFAULT_LIVE_ROUTE_LIMIT,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  concurrency = DEFAULT_CONCURRENCY,
  manifestPath = DEFAULT_X402_MANIFEST_FIXTURE,
} = {}) {
  const probes = loadAllowlistedProbeUrls(manifestPath, source);
  const byKey = new Map(probes.map((probe) => [probe.key, probe]));
  const observations = [];

  if (mode === "prior-only") {
    for (const row of source.routes || []) {
      if (row.seller !== SAMEDAYDESK_SELLER || row.origin !== ALLOWED_ORIGIN) continue;
      observations.push(observationFromPriorEvidence(row, asOf));
    }
    return dedupeObservations(observations);
  }

  if (mode === "fixtures") {
    for (const row of source.routes || []) {
      if (row.seller !== SAMEDAYDESK_SELLER || row.origin !== ALLOWED_ORIGIN) continue;
      const key = routeKey(row.method, row.origin, row.route);
      const probe = byKey.get(key);
      const fixture = fixtureMap[key] || fixtureMap[row.route];
      if (fixture && probe) {
        observations.push(observationFromFixture(probe, asOf, fixture));
      } else {
        observations.push(observationFromPriorEvidence(row, asOf));
      }
    }
    return dedupeObservations(observations);
  }

  if (mode === "live") {
    const liveProbes = probes.filter((probe) => probe.method === "GET").slice(0, liveRouteLimit);
    const liveResults = await mapPool(liveProbes, concurrency, (probe) =>
      observeProbe(probe, asOf, {
        fetchImpl,
        timeoutMs,
        maxBytes,
        allowlist: probes,
      }),
    );
    const liveByKey = new Map(liveResults.map((row) => [row.key, row]));
    for (const row of source.routes || []) {
      if (row.seller !== SAMEDAYDESK_SELLER || row.origin !== ALLOWED_ORIGIN) continue;
      const key = routeKey(row.method, row.origin, row.route);
      observations.push(liveByKey.get(key) || observationFromPriorEvidence(row, asOf));
    }
    return dedupeObservations(observations);
  }

  throw new Error(`unsupported observation mode: ${mode}`);
}

export function dedupeObservations(observations) {
  const seen = new Set();
  const out = [];
  for (const row of observations) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    out.push(row);
  }
  return out;
}

export function buildCandidateCrawl(source, observations, asOf) {
  const byKey = new Map(observations.map((row) => [row.key, row]));
  const routes = [];
  for (const row of source.routes || []) {
    if (row.seller !== SAMEDAYDESK_SELLER || row.origin !== ALLOWED_ORIGIN) continue;
    const key = routeKey(row.method, row.origin, row.route);
    const obs = byKey.get(key);
    if (!obs || obs.status !== "current" || !obs.lastObservation) {
      // Expired/unrechecked/failed/unknown: do not copy prior lastVerified into a
      // current claim. Prior evidence remains only on the observation record.
      routes.push({
        ...row,
        lastVerified: null,
        contractHash: null,
        unpaid402:
          row.unpaid402 && row.unpaid402.source === "live_unpaid_402"
            ? { ...row.unpaid402, source: "x402_manifest" }
            : row.unpaid402,
      });
      continue;
    }
    const last = obs.lastObservation;
    routes.push({
      ...row,
      lastVerified: last.observedAt,
      contractHash: last.contractHash,
      unpaid402: last.unpaid402,
      outputExampleKeys: last.outputExampleKeys,
      unpaid402OutputSchemaPresent: last.unpaid402OutputSchemaPresent === true,
      // Keep prior Bazaar evidence; never invent a fresh bazaarObservedAt.
      cdpBazaar: row.cdpBazaar,
      openapiPresent: row.openapiPresent === true,
    });
  }
  return {
    ...source,
    checkedAt: asOf,
    routes,
    limitations: [
      ...(source.limitations || []),
      "Candidate crawl from operator-triggered verified-feed refresh. Current unpaid-402 claims require a successful observation at checkedAt. Failed, unknown, or unrechecked routes keep lastObservation only on the observation report.",
    ],
  };
}

export function assertNoSecrets(value) {
  const blob = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /PAYMENT-SIGNATURE/i,
    /X-PAYMENT\s*:/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /"authorization"\s*:\s*"Bearer\s+/i,
    /api[_-]?key"\s*:\s*"[^"]{12,}/i,
  ];
  for (const pattern of patterns) {
    if (pattern.test(blob)) {
      throw new Error(`secret-like material present: ${pattern}`);
    }
  }
  return true;
}
