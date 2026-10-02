/** SPDX-License-Identifier: MIT
 * Select journey routes from the current catalog and OpenAPI document.
 */
import { createHash } from "node:crypto";

import { ContinuationError, recovery } from "./errors.mjs";

export const CATALOG_SCHEMA = "ein.agent-service-catalog.v1";
export const OPENAPI_VERSION = "3.1.0";
export const PUBLISHED_LINK_ORIGIN = "https://ein.llc";
export const JOURNEY_IDS = Object.freeze([
  "assess_formation_need",
  "prepare_application",
  "get_application_status",
  "request_operator_action",
]);
export const TERMINAL_OUTCOMES = new Set([
  "already_satisfied",
  "not_needed_now",
  "insufficient_information",
]);
export const CLAIMABLE_OUTCOMES = new Set(["recommended_for_review", "required_for_selected_path"]);
export const APPLICATION_STATUSES = new Set([
  "provisional",
  "provisional_incomplete",
  "claimed",
  "quoted",
  "paid",
  "async_pending",
  "async_failed",
]);

const MACHINE_OPS = {
  assess_formation_need: { method: "POST", application: false },
  prepare_application: { method: "POST", application: true },
  get_application_status: { method: "GET", application: false },
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value ?? null;
}

export function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

export function isLoopbackOrigin(origin) {
  const url = new URL(origin);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
}

export function termsMaterial(catalog) {
  const entry = catalog.machineEntry ?? {};
  const journey = JOURNEY_IDS.map((id) => {
    const operation = (catalog.operations ?? []).find((item) => item?.id === id) ?? null;
    if (!operation) return { id, present: false };
    return {
      id,
      present: true,
      method: operation.method ?? null,
      path: operation.path ?? null,
      deploymentStatus: operation.deploymentStatus ?? null,
      payment: operation.payment ?? null,
      sideEffects: operation.sideEffects ?? null,
      note: operation.note ?? null,
    };
  });
  return {
    schema: catalog.schema ?? null,
    catalogVersion: catalog.catalogVersion ?? null,
    providerUrl: catalog.provider?.url ?? null,
    offer: entry.offerReferenced ?? null,
    ordering: catalog.ordering ?? null,
    operatorConstraints: entry.operatorConstraints ?? null,
    whenHumanOwnedClaimHelps: entry.whenHumanOwnedClaimHelps ?? null,
    boundaries: catalog.boundaries ?? null,
    notOfferedOnThisOrigin: catalog.notOfferedOnThisOrigin ?? null,
    journey,
  };
}

export function termsFingerprint(catalog) {
  return sha256Json(termsMaterial(catalog));
}

function operationById(catalog, id) {
  return (catalog.operations ?? []).find((item) => item && item.id === id) ?? null;
}

function assertNoAuthority(operation) {
  const effects = operation.sideEffects ?? {};
  if (effects.filingAuthority !== false || effects.paymentAuthority !== false) {
    throw new ContinuationError({
      code: "unsupported_terms",
      message: `${operation.id} is not a no-filing, no-payment route on this catalog.`,
      recovery: recovery(
        "stop",
        "Do not prepare or pay. The current catalog does not keep filing and payment authority off this operation.",
      ),
    });
  }
}

function assertPath(operation, method) {
  if (operation.method !== method || typeof operation.path !== "string" || !operation.path.startsWith("/api/")) {
    throw new ContinuationError({
      code: "capability_unavailable",
      message: `${operation.id} has no supported ${method} path in the current catalog.`,
      recovery: recovery(
        "rediscover",
        "Read the current catalog again. Do not call a path remembered from another machine.",
      ),
    });
  }
  if (operation.path.includes("?") || operation.path.includes("#") || operation.path.includes("\\")) {
    throw new ContinuationError({
      code: "unsupported_route",
      message: `${operation.id} path is not a plain origin path.`,
      recovery: recovery("stop", "Refuse this catalog route. Do not follow a query or foreign path."),
    });
  }
}

function assertOpenApi(openapi, path, method) {
  const node = openapi?.paths?.[path];
  if (!node || node[method.toLowerCase()] == null) {
    throw new ContinuationError({
      code: "contract_mismatch",
      message: `OpenAPI does not publish ${method} ${path}.`,
      recovery: recovery(
        "stop",
        "The catalog route and the OpenAPI document disagree. Do not call either path until they match.",
      ),
    });
  }
}

export function selectRoutes(catalog, openapi) {
  if (!catalog || catalog.schema !== CATALOG_SCHEMA || typeof catalog.catalogVersion !== "string") {
    throw new ContinuationError({
      code: "unsupported_schema",
      message: "Service catalog schema or version is not ein.agent-service-catalog.v1.",
      recovery: recovery("stop", "Discover again when the origin publishes the current catalog schema."),
    });
  }
  if (!openapi || openapi.openapi !== OPENAPI_VERSION || !openapi.paths) {
    throw new ContinuationError({
      code: "unsupported_schema",
      message: "OpenAPI document is not version 3.1.0.",
      recovery: recovery("stop", "Discover again when the origin publishes the current OpenAPI document."),
    });
  }
  if (catalog.ordering?.instantAgentCheckout !== false) {
    throw new ContinuationError({
      code: "lane_refused",
      message: "This origin offers instant agent checkout. That lane is refused.",
      recovery: recovery(
        "stop",
        "Autonomous machine purchase is not this journey. Use a human claim on an origin that keeps instant agent checkout off.",
      ),
    });
  }
  const selected = {};
  for (const [id, expected] of Object.entries(MACHINE_OPS)) {
    const operation = operationById(catalog, id);
    if (!operation || operation.deploymentStatus !== "available") {
      throw new ContinuationError({
        code: "capability_unavailable",
        message: `${id} is not available on the current catalog.`,
        recovery: recovery("rediscover", "Choose another origin only by reading its current catalog. Do not reuse a stale path."),
      });
    }
    assertPath(operation, expected.method);
    assertNoAuthority(operation);
    if (operation.sideEffects?.createsProvisionalApplication !== expected.application) {
      throw new ContinuationError({
        code: "contract_mismatch",
        message: `${id} does not match the expected provisional-application boundary.`,
        recovery: recovery("stop", "Do not call this operation. The catalog changed what it creates."),
      });
    }
    assertOpenApi(openapi, operation.path, expected.method);
    selected[id] = {
      id,
      method: expected.method,
      path: operation.path,
      payment: operation.payment ?? null,
      note: operation.note ?? null,
      sideEffects: operation.sideEffects,
    };
  }
  const human = operationById(catalog, "request_operator_action");
  if (!human || human.deploymentStatus !== "available" || typeof human.url !== "string") {
    throw new ContinuationError({
      code: "capability_unavailable",
      message: "The human claim/review step is not in the current catalog.",
      recovery: recovery("stop", "Do not invent a claim or payment URL."),
    });
  }
  assertNoAuthority(human);
  return { routes: selected, human };
}

export function resolveLinkOrigin(catalog, apiOrigin) {
  let provider;
  try {
    provider = new URL(catalog.provider?.url);
  } catch {
    throw new ContinuationError({
      code: "unsupported_terms",
      message: "Catalog provider URL is missing.",
      recovery: recovery("stop", "Do not send a claim link until the catalog names an https provider origin."),
    });
  }
  if (provider.protocol !== "https:" || provider.username || provider.password || provider.hash) {
    throw new ContinuationError({
      code: "origin_mismatch",
      message: "Catalog provider origin is not a plain https origin.",
      recovery: recovery("stop", "Refuse this catalog. Do not send credentials to it."),
    });
  }
  const api = new URL(apiOrigin);
  if (api.origin === provider.origin) return provider.origin;
  if (isLoopbackOrigin(apiOrigin) && provider.origin === PUBLISHED_LINK_ORIGIN) return provider.origin;
  throw new ContinuationError({
    code: "origin_mismatch",
    message: "Catalog provider origin does not match this API origin.",
    recovery: recovery(
      "use_recorded_origin",
      "Continue on the origin recorded for this task. A different origin is not a new login and must not receive this task's grant or claim link.",
    ),
  });
}

export function surfacePath(value, allowedOrigins) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ContinuationError({
      code: "unsupported_route",
      message: "Catalog surface URL is not usable.",
      recovery: recovery("stop", "Do not call a surface the current catalog did not publish as an absolute URL."),
    });
  }
  if (!allowedOrigins.includes(url.origin) || url.username || url.password || url.search || url.hash) {
    throw new ContinuationError({
      code: "origin_mismatch",
      message: "Catalog surface is not on the API origin or the published link origin.",
      recovery: recovery("stop", "Refuse the surface. Do not follow it."),
    });
  }
  return url.pathname;
}

export function describeDiscovery({ catalog, apiOrigin, linkOrigin, fingerprint, routes, human }) {
  const entry = catalog.machineEntry ?? {};
  return {
    apiOrigin,
    linkOrigin,
    catalogSchema: catalog.schema,
    catalogVersion: catalog.catalogVersion,
    termsFingerprint: fingerprint,
    capabilities: Object.values(routes).map((route) => ({
      id: route.id,
      method: route.method,
      path: route.path,
      payment: route.payment,
      createsProvisionalApplication: route.sideEffects.createsProvisionalApplication,
      prerequisite: route.note,
    })),
    humanStep: {
      id: human.id,
      url: human.url,
      payment: human.payment ?? null,
      prerequisite: human.note ?? null,
    },
    prerequisites: Array.isArray(entry.operatorConstraints) ? entry.operatorConstraints : [],
    humanClaim: Array.isArray(entry.whenHumanOwnedClaimHelps) ? entry.whenHumanOwnedClaimHelps : [],
    offer: entry.offerReferenced ?? null,
    lanes: {
      agent_assisted_human: "https origin; human claims and pays",
      disposable_owner_qa: "loopback API only",
      autonomous_machine_purchase: "refused",
    },
    instantAgentCheckout: false,
    filingAuthorization: false,
  };
}

export function sameOriginLink(value, linkOrigin, applicationId, { claim = false } = {}) {
  try {
    if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
    const url = new URL(value);
    const loopback = isLoopbackOrigin(url.origin);
    const protocolOk = url.protocol === "https:" || (url.protocol === "http:" && loopback);
    if (!protocolOk || url.origin !== linkOrigin || url.username || url.password || url.hash) return null;
    if (url.pathname !== `/review/${applicationId}`) return null;
    const keys = [...url.searchParams.keys()];
    if (!claim) return keys.length === 0 ? url : null;
    if (keys.length !== 1 || keys[0] !== "claim" || !url.searchParams.get("claim")) return null;
    return url;
  } catch {
    return null;
  }
}
