import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PACK_ROOT, REPO_ROOT } from "./paths.ts";

export const AGENTS_GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const SDS_EXPRESS_ORIGIN = "https://samedaydesk.com";
export const AGENTS_LIVE_PROBE_PATH = "/healthz";
export const AGENTS_UNSUPPORTED_HEALTH_PATH = "/health";
export const SDS_EXPRESS_HEALTH_PATH = "/api/health";
export const C31_RECIPE_HEALTH_PATH = "/recipes/page-change/health";

export const DO_NOT_REWRITE_SDS_API_HEALTH =
  "Do not rewrite SDS Express GET /api/health. That route is app health on server/routes/health.js mounted at /api in server/app.js, not the F18 agents-gateway defect.";

export type HealthSurface = "agents-gateway" | "sds-express" | "unknown";

export type HealthProbeInput = {
  origin: string;
  path: string;
  status?: number | null;
  body?: unknown;
};

export type HealthSurfaceDiagnosis = {
  surface: HealthSurface;
  path: string;
  supported: boolean;
  liveProbe: boolean;
  notes: string;
  f18Defect: boolean;
  rewriteSdsApiHealth: false;
};

export type RecordedHealthProbe = {
  origin: string;
  path: string;
  method: "GET";
  status: number | null;
  body: unknown;
  source: "fixture";
};

/** Pack-local F18 probe table. Not a live network requirement. */
export const F18_HEALTH_RECORDED_PROBES: readonly RecordedHealthProbe[] = Object.freeze([
  Object.freeze({
    origin: AGENTS_GATEWAY_ORIGIN,
    path: AGENTS_UNSUPPORTED_HEALTH_PATH,
    method: "GET",
    status: 404,
    body: Object.freeze({ error: "Not found" }),
    source: "fixture",
  }),
  Object.freeze({
    origin: AGENTS_GATEWAY_ORIGIN,
    path: AGENTS_LIVE_PROBE_PATH,
    method: "GET",
    status: 200,
    body: Object.freeze({ ok: true }),
    source: "fixture",
  }),
  Object.freeze({
    origin: SDS_EXPRESS_ORIGIN,
    path: SDS_EXPRESS_HEALTH_PATH,
    method: "GET",
    status: 200,
    body: Object.freeze({ ok: true, service: "samedaydesk" }),
    source: "fixture",
  }),
]);

const SDS_HEALTH_ROUTE = join(REPO_ROOT, "server/routes/health.js");
const SDS_APP = join(REPO_ROOT, "server/app.js");
const MACHINE_ENTRY = join(REPO_ROOT, "client/src/data/machineEntry.mjs");

function hostnameOf(origin: string): string {
  try {
    const url = origin.includes("://") ? new URL(origin) : new URL(`https://${origin}`);
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function originOf(origin: string): string {
  try {
    const url = origin.includes("://") ? new URL(origin) : new URL(`https://${origin}`);
    return url.origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
}

export function normalizeHealthPath(path: string): string {
  let raw = path.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      /* keep raw */
    }
  }
  const noQuery = raw.split("?")[0] ?? raw;
  let pathname = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  return pathname;
}

export function classifyHealthSurface(origin: string): HealthSurface {
  const label = origin.trim().toLowerCase();
  if (label === "agents-gateway" || label === "agents") return "agents-gateway";
  if (label === "sds-express" || label === "sds" || label === "sds-express-origin") {
    return "sds-express";
  }

  const host = hostnameOf(origin);
  if (host === "agents.samedaydesk.com") return "agents-gateway";
  if (originOf(origin) === AGENTS_GATEWAY_ORIGIN) return "agents-gateway";

  if (
    host === "samedaydesk.com"
    || host === "www.samedaydesk.com"
    || host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
  ) {
    return "sds-express";
  }

  return "unknown";
}

function statusClause(status?: number | null): string {
  if (typeof status !== "number") return "";
  return ` Recorded status ${status}.`;
}

function withDoNotRewrite(notes: string): string {
  if (notes.includes("Do not rewrite SDS Express GET /api/health")) return notes;
  return `${notes} ${DO_NOT_REWRITE_SDS_API_HEALTH}`;
}

/**
 * Presence-only health-surface diagnostic. Does not mutate production routes.
 * F18 is agents GET /health unsupported; live probe is GET /healthz.
 * SDS GET /api/health is a different, valid Express app health route.
 */
export function diagnoseHealthSurface(input: HealthProbeInput): HealthSurfaceDiagnosis {
  const path = normalizeHealthPath(input.path);
  const surface = classifyHealthSurface(input.origin);
  const rewriteSdsApiHealth = false as const;
  const status = input.status;

  if (surface === "agents-gateway" && path === AGENTS_UNSUPPORTED_HEALTH_PATH) {
    return {
      surface,
      path,
      supported: false,
      liveProbe: false,
      f18Defect: true,
      rewriteSdsApiHealth,
      notes: withDoNotRewrite(
        `F18 reproduction: GET ${AGENTS_UNSUPPORTED_HEALTH_PATH} is unsupported on the agents gateway (${AGENTS_GATEWAY_ORIGIN}). Live probe is GET ${AGENTS_LIVE_PROBE_PATH}.${statusClause(status)}`,
      ),
    };
  }

  if (surface === "agents-gateway" && path === AGENTS_LIVE_PROBE_PATH) {
    return {
      surface,
      path,
      supported: true,
      liveProbe: true,
      f18Defect: false,
      rewriteSdsApiHealth,
      notes: withDoNotRewrite(
        `Live agents gateway probe: GET ${AGENTS_LIVE_PROBE_PATH} on ${AGENTS_GATEWAY_ORIGIN}. client/src/data/machineEntry.mjs LIVE_INVENTORY health href is GATEWAY_ORIGIN + ${AGENTS_LIVE_PROBE_PATH}.${statusClause(status)}`,
      ),
    };
  }

  if (surface === "agents-gateway" && path === C31_RECIPE_HEALTH_PATH) {
    return {
      surface,
      path,
      supported: true,
      liveProbe: false,
      f18Defect: false,
      rewriteSdsApiHealth,
      notes: withDoNotRewrite(
        `C31 recipe health (${C31_RECIPE_HEALTH_PATH}) is not the gateway LIVE_INVENTORY live probe (${AGENTS_LIVE_PROBE_PATH}).`,
      ),
    };
  }

  if (surface === "sds-express" && path === SDS_EXPRESS_HEALTH_PATH) {
    return {
      surface,
      path,
      supported: true,
      liveProbe: false,
      f18Defect: false,
      rewriteSdsApiHealth,
      notes: withDoNotRewrite(
        `SDS Express app health GET ${SDS_EXPRESS_HEALTH_PATH} via server/routes/health.js (router.get("/health")) mounted at /api in server/app.js. Not the F18 agents-gateway defect and not the agents live probe.${statusClause(status)}`,
      ),
    };
  }

  if (surface === "sds-express") {
    return {
      surface,
      path,
      supported: path === SDS_EXPRESS_HEALTH_PATH,
      liveProbe: false,
      f18Defect: false,
      rewriteSdsApiHealth,
      notes: withDoNotRewrite(
        `SDS Express origin-like surface. App health is GET ${SDS_EXPRESS_HEALTH_PATH}, not agents GET ${AGENTS_UNSUPPORTED_HEALTH_PATH}. Not the F18 defect.`,
      ),
    };
  }

  if (surface === "agents-gateway") {
    return {
      surface,
      path,
      supported: false,
      liveProbe: false,
      f18Defect: false,
      rewriteSdsApiHealth,
      notes: withDoNotRewrite(
        `Agents gateway path ${path} is not the live probe GET ${AGENTS_LIVE_PROBE_PATH}. F18 concerns unsupported GET ${AGENTS_UNSUPPORTED_HEALTH_PATH} only.`,
      ),
    };
  }

  return {
    surface: "unknown",
    path,
    supported: false,
    liveProbe: false,
    f18Defect: false,
    rewriteSdsApiHealth,
    notes: withDoNotRewrite(
      `Unknown health surface for origin ${input.origin} path ${path}. F18 is agents GET ${AGENTS_UNSUPPORTED_HEALTH_PATH} vs live GET ${AGENTS_LIVE_PROBE_PATH}.`,
    ),
  };
}

export function recommendsRewriteSdsApiHealth(notes: string): boolean {
  const sentences = notes.split(/(?<=[.!])\s+/);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const mentionsSdsHealth =
      lower.includes("/api/health")
      || lower.includes("server/routes/health")
      || lower.includes("sds express");
    if (!mentionsSdsHealth) continue;
    if (
      /\bdo not\b/.test(lower)
      || /\bdon't\b/.test(lower)
      || /\bmust not\b/.test(lower)
      || /\bnever\b/.test(lower)
      || /\bnot\b.{0,40}\brewrite\b/.test(lower)
    ) {
      continue;
    }
    if (/\b(rewrite|replace|remove|delete|patch|change)\b/.test(lower)) return true;
  }
  return false;
}

export function readSdsExpressHealthOnDisk(): {
  healthRouteFile: string;
  appFile: string;
  containsRouterGetHealth: boolean;
  mountedAtApi: boolean;
  treatedAsF18Defect: false;
  rewriteSdsApiHealth: false;
} {
  const healthJs = readFileSync(SDS_HEALTH_ROUTE, "utf8");
  const appJs = readFileSync(SDS_APP, "utf8");
  return {
    healthRouteFile: "server/routes/health.js",
    appFile: "server/app.js",
    containsRouterGetHealth: healthJs.includes('router.get("/health"'),
    mountedAtApi: /app\.use\(\s*"\/api"\s*,\s*healthRouter\s*\)/.test(appJs),
    treatedAsF18Defect: false,
    rewriteSdsApiHealth: false,
  };
}

export function readMachineEntryHealthFacts(): {
  file: string;
  gatewayOrigin: string | null;
  liveInventoryHealthHref: string;
  liveInventoryPointsAtHealthz: boolean;
  liveInventoryPointsAtUnsupportedHealth: boolean;
  c31RecipeHealth: string;
} {
  const text = readFileSync(MACHINE_ENTRY, "utf8");
  const gateway = /export const GATEWAY_ORIGIN = "([^"]+)"/.exec(text)?.[1] ?? null;
  const liveStart = text.indexOf("export const LIVE_INVENTORY");
  const liveEnd =
    liveStart >= 0 ? text.indexOf("\nexport const ", liveStart + 1) : -1;
  const liveBlock =
    liveStart >= 0
      ? text.slice(liveStart, liveEnd >= 0 ? liveEnd : text.length)
      : "";
  const healthHrefHealthz =
    /label:\s*"Health, prices, and protocol route counts"\s*,\s*href:\s*`\$\{GATEWAY_ORIGIN\}\/healthz`/.test(
      liveBlock,
    );
  const healthHrefUnsupported = /href:\s*`\$\{GATEWAY_ORIGIN\}\/health`/.test(liveBlock);
  return {
    file: "client/src/data/machineEntry.mjs",
    gatewayOrigin: gateway,
    liveInventoryHealthHref: `${gateway ?? AGENTS_GATEWAY_ORIGIN}${AGENTS_LIVE_PROBE_PATH}`,
    liveInventoryPointsAtHealthz: healthHrefHealthz,
    liveInventoryPointsAtUnsupportedHealth: healthHrefUnsupported,
    c31RecipeHealth: `${gateway ?? AGENTS_GATEWAY_ORIGIN}${C31_RECIPE_HEALTH_PATH}`,
  };
}

type LiveObservation = {
  origin: string;
  path: string;
  method: "GET";
  source: "live";
  status: number | null;
  body: unknown;
  error: string | null;
};

async function probeLive(path: string, timeoutMs: number): Promise<LiveObservation> {
  const url = `${AGENTS_GATEWAY_ORIGIN}${path}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json,*/*;q=0.1" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return {
      origin: AGENTS_GATEWAY_ORIGIN,
      path,
      method: "GET",
      source: "live",
      status: response.status,
      body,
      error: null,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "fetch-failed";
    const message = err instanceof Error ? err.message : String(err);
    return {
      origin: AGENTS_GATEWAY_ORIGIN,
      path,
      method: "GET",
      source: "live",
      status: null,
      body: null,
      error: `${name}: ${message}`,
    };
  }
}

export type F18HealthReproduction = {
  id: "F18-health";
  evaluator: "f18-health";
  disposition: "reproduced";
  authorized: false;
  provenance: "fixture";
  saleState: "not_a_sale";
  productionRoutesMutated: false;
  rewriteSdsApiHealth: false;
  liveNetworkUsed: boolean;
  recordedProbes: readonly RecordedHealthProbe[];
  diagnoses: HealthSurfaceDiagnosis[];
  liveObservations: LiveObservation[] | null;
  sdsExpressHealthOnDisk: ReturnType<typeof readSdsExpressHealthOnDisk>;
  machineEntry: ReturnType<typeof readMachineEntryHealthFacts>;
  corpusFixturePath: string;
};

export async function reproduceF18Health(
  options: { live?: boolean; timeoutMs?: number } = {},
): Promise<F18HealthReproduction> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const diagnoses = F18_HEALTH_RECORDED_PROBES.map((probe) =>
    diagnoseHealthSurface({
      origin: probe.origin,
      path: probe.path,
      status: probe.status,
      body: probe.body,
    }),
  );

  let liveObservations: LiveObservation[] | null = null;
  let liveNetworkUsed = false;
  if (options.live === true) {
    liveObservations = await Promise.all([
      probeLive(AGENTS_UNSUPPORTED_HEALTH_PATH, timeoutMs),
      probeLive(AGENTS_LIVE_PROBE_PATH, timeoutMs),
    ]);
    liveNetworkUsed = liveObservations.some((row) => row.error === null);
  }

  return {
    id: "F18-health",
    evaluator: "f18-health",
    disposition: "reproduced",
    authorized: false,
    provenance: "fixture",
    saleState: "not_a_sale",
    productionRoutesMutated: false,
    rewriteSdsApiHealth: false,
    liveNetworkUsed,
    recordedProbes: F18_HEALTH_RECORDED_PROBES,
    diagnoses,
    liveObservations,
    sdsExpressHealthOnDisk: readSdsExpressHealthOnDisk(),
    machineEntry: readMachineEntryHealthFacts(),
    corpusFixturePath: join(PACK_ROOT, "fixtures/corpus/F18-health.json"),
  };
}
