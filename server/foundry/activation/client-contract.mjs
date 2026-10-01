import { isDeepStrictEqual } from "node:util";
import { factsFrom } from "./classify.mjs";
import { judgeHostLaunch, judgeUnenrolledHostedSuccess } from "./host-config.mjs";
import {
  correspondenceReuseSignals,
  isolationSignals,
  PRODUCT_DATA_HOST,
  PRODUCT_DATA_PROJECT_REF,
  REUSE_CLASS,
  reusesProductDataService,
} from "../product-isolation.js";

export {
  isolationSignals,
  PRODUCT_DATA_HOST,
  PRODUCT_DATA_PROJECT_REF,
  REUSE_CLASS,
  reusesProductDataService,
};
export const OFFICIAL_MCP = Object.freeze({
  protocolVersion: "2025-11-25",
  serverName: "samedaydesk-agent-tools",
  serverVersion: "1.2.0",
});

const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\/[^/\s]*:[^@/\s]+@/i,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /sk_(?:live|test)_/i,
  /whsec_/,
  /(?:^|[^A-Za-z0-9])re_[A-Za-z0-9]{8,}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /service_role/i,
  /sb_secret_/i,
];

const NONSECRET_FLAGS = new Set(["secretsCopied", "secretCopied"]);

export const ENROLLED_PRODUCT_BASELINE = Object.freeze({
  supabase: true,
  stripe: true,
  email: true,
});

const METADATA_KEYS = Object.freeze([
  "productionActivate",
  "productionReady",
  "secretsCopied",
  "panelEnvRead",
  "hostingerApiReread",
  "hostingerChanged",
  "launchedService",
  "measuredAt",
  "origin",
  "platform",
  "githubMain",
  "citedBuild",
  "public",
  "productDataService",
  "correspondenceDataService",
]);
const CITED_KEYS = Object.freeze(["source", "buildId", "commit", "node", "framework", "entry", "apiReread"]);
const PUBLIC_KEYS = Object.freeze([
  "health",
  "correspondenceHealthz",
  "foundryReceiverStatus",
  "visitorEntryStatus",
  "uploadsStatus",
  "mcp",
]);
const HEALTH_KEYS = Object.freeze(["status", "service", "ok", "configured"]);
const CONFIGURED_KEYS = Object.freeze(["supabase", "stripe", "email"]);
const HEALTHZ_KEYS = Object.freeze(["status", "enabled", "reason"]);
const MCP_KEYS = Object.freeze(["status", "protocolVersion", "serverName", "serverVersion", "toolsCalled"]);
const PRODUCT_KEYS = Object.freeze(["kind", "host", "configured", "secretCopied"]);
const CORRESPONDENCE_KEYS = Object.freeze(["enrolled", "schema", "separateFromProduct"]);

function rejected(reason, code = "false_green_rejected") {
  return {
    ok: false,
    exitCode: 2,
    code,
    class: code,
    reason,
    productionActivate: "HOLD",
    productionReady: false,
    secretsCopied: false,
    launchedService: false,
  };
}

export function secretBearingName(key) {
  if (typeof key !== "string" || NONSECRET_FLAGS.has(key)) return false;
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase();
  return /(^|_)(admin_token|participation_key|private_profile|service_role|service_secret|product_service_secret|api_key|password|passwd|secret|token|credential)(_|$)/.test(normalized);
}

export function findSecret(value, seen = new Set()) {
  if (typeof value === "string") {
    return SECRET_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => findSecret(item, seen));
  return Object.entries(value).some(([key, item]) => secretBearingName(key) || findSecret(item, seen));
}

function exactKeys(value, keys) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0;
}

export function metadataShape(metadata) {
  if (!exactKeys(metadata, METADATA_KEYS)) return false;
  if (metadata.productionActivate !== "HOLD") return false;
  for (const key of ["productionReady", "secretsCopied", "panelEnvRead", "hostingerApiReread", "hostingerChanged", "launchedService"]) {
    if (typeof metadata[key] !== "boolean") return false;
  }
  if (!stringValue(metadata.measuredAt) || !stringValue(metadata.origin) || !stringValue(metadata.platform) || !stringValue(metadata.githubMain)) {
    return false;
  }
  const cited = metadata.citedBuild;
  if (!exactKeys(cited, CITED_KEYS)) return false;
  for (const key of ["source", "buildId", "commit", "node", "framework", "entry"]) {
    if (!stringValue(cited[key])) return false;
  }
  if (typeof cited.apiReread !== "boolean") return false;
  const pub = metadata.public;
  if (!exactKeys(pub, PUBLIC_KEYS)) return false;
  if (!exactKeys(pub.health, HEALTH_KEYS) || typeof pub.health.status !== "number" || !stringValue(pub.health.service) || typeof pub.health.ok !== "boolean") {
    return false;
  }
  if (!exactKeys(pub.health.configured, CONFIGURED_KEYS)) return false;
  for (const key of CONFIGURED_KEYS) {
    if (typeof pub.health.configured[key] !== "boolean") return false;
  }
  const hz = pub.correspondenceHealthz;
  if (!exactKeys(hz, HEALTHZ_KEYS) || typeof hz.status !== "number" || typeof hz.enabled !== "boolean") return false;
  if (hz.reason !== null && !stringValue(hz.reason)) return false;
  for (const key of ["foundryReceiverStatus", "visitorEntryStatus", "uploadsStatus"]) {
    if (typeof pub[key] !== "number") return false;
  }
  const mcp = pub.mcp;
  if (!exactKeys(mcp, MCP_KEYS) || typeof mcp.status !== "number" || typeof mcp.toolsCalled !== "boolean") return false;
  for (const key of ["protocolVersion", "serverName", "serverVersion"]) {
    if (!stringValue(mcp[key])) return false;
  }
  const product = metadata.productDataService;
  if (!exactKeys(product, PRODUCT_KEYS) || !stringValue(product.kind) || !stringValue(product.host)) return false;
  if (typeof product.configured !== "boolean" || typeof product.secretCopied !== "boolean") return false;
  const correspondence = metadata.correspondenceDataService;
  if (!exactKeys(correspondence, CORRESPONDENCE_KEYS) || typeof correspondence.enrolled !== "boolean") return false;
  if (!stringValue(correspondence.schema) || typeof correspondence.separateFromProduct !== "boolean") return false;
  return true;
}

export function stableProductConfiguration(observed, baseline = ENROLLED_PRODUCT_BASELINE) {
  if (!Array.isArray(observed) || observed.length === 0) return false;
  return observed.every((item) => isDeepStrictEqual(item, baseline));
}

export function correspondenceReuse(metadata) {
  return correspondenceReuseSignals(metadata);
}

export function clientSurfaces(observation) {
  const health = observation?.sdsHealth || {};
  const configured = health.configured || {};
  const mcp = observation?.mcp || {};
  const reasons = [];
  if (health.status !== 200 || health.service !== "samedaydesk" || health.ok !== true) reasons.push("sds_health");
  for (const key of ["supabase", "stripe", "email"]) {
    if (typeof configured[key] !== "boolean") reasons.push(`configured_${key}`);
    else if (configured[key] !== ENROLLED_PRODUCT_BASELINE[key]) reasons.push(`configured_${key}_changed`);
  }
  if (observation?.uploads?.status !== 501) reasons.push("uploads");
  if (mcp.status !== 200
    || mcp.protocolVersion !== OFFICIAL_MCP.protocolVersion
    || mcp.serverName !== OFFICIAL_MCP.serverName
    || mcp.serverVersion !== OFFICIAL_MCP.serverVersion
    || mcp.toolsCalled !== false) {
    reasons.push("mcp");
  }
  const stamp = {
    service: health.service ?? null,
    configured: {
      supabase: configured.supabase === true,
      stripe: configured.stripe === true,
      email: configured.email === true,
    },
    uploads: observation?.uploads?.status ?? null,
    mcp: {
      protocolVersion: mcp.protocolVersion ?? null,
      serverName: mcp.serverName ?? null,
      serverVersion: mcp.serverVersion ?? null,
      toolsCalled: false,
    },
  };
  return { ok: reasons.length === 0, reasons, stamp };
}

export function observationFromPublic(metadata) {
  const pub = metadata?.public || {};
  const health = pub.health || {};
  const hz = pub.correspondenceHealthz || {};
  const mcp = pub.mcp || {};
  return {
    productionActivate: "HOLD",
    sdsHealth: {
      status: health.status,
      service: health.service,
      ok: health.ok === true,
      configured: health.configured || {},
    },
    correspondenceHealthz: {
      status: hz.status,
      body: {
        ok: false,
        enabled: hz.enabled === true,
        reason: hz.reason ?? null,
        store: null,
      },
    },
    foundryReceiver: { status: pub.foundryReceiverStatus, body: null },
    visitorEntry: { status: pub.visitorEntryStatus, hasProfile: false },
    uploads: { status: pub.uploadsStatus },
    mcp,
    publicCatalog: null,
    task: null,
    retrieval: null,
  };
}

export function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return rejected("metadata_missing");
  if (findSecret(metadata) || metadata.secretsCopied === true) return rejected("secret_material");
  if (metadata.productionActivate !== "HOLD") return rejected("production_activate_not_hold");
  const reuse = correspondenceReuse(metadata);
  if (reuse.length) return { ...rejected(REUSE_CLASS, REUSE_CLASS), signals: reuse };
  if (metadata.productionReady === true || metadata.hostingerChanged === true || metadata.launchedService === true) {
    return rejected("production_ready_claim");
  }
  if (metadata.hostingerApiReread === true || metadata.citedBuild?.apiReread === true || metadata.panelEnvRead === true) {
    return rejected("panel_read_not_evidenced");
  }
  if (!metadataShape(metadata)) return rejected("metadata_shape");
  return null;
}

function interopEarned(observation, surfaces) {
  const interop = observation?.interop;
  return surfaces.ok
    && interop?.officialVisitorClient?.outputMatched === true
    && interop?.officialVisitorClient?.distinctProjects === true
    && interop?.portableKit?.matchedHeldOut === true
    && interop?.portableKit?.restarted === true
    && interop?.productionReady === false;
}

export function judgeClient(observation) {
  if (findSecret(observation)) return rejected("secret_material");
  const withheld = judgeHostLaunch(observation);
  if (withheld.rejected) return withheld;
  const unenrolled = judgeUnenrolledHostedSuccess(observation);
  if (unenrolled.rejected) return unenrolled;
  const reuse = correspondenceReuse(observation);
  if (reuse.length) return { ...rejected(REUSE_CLASS, REUSE_CLASS), signals: reuse };
  if (!observation || observation.productionActivate !== "HOLD") return rejected("production_activate_not_hold");
  if (observation.productionReady === true) return rejected("production_ready_claim");
  const surfaces = clientSurfaces(observation);
  const changed = surfaces.reasons.filter((reason) => reason.endsWith("_changed"));
  if (changed.length) {
    return {
      ok: false,
      exitCode: 1,
      code: "product_configuration_changed",
      reasons: changed,
      productionActivate: "HOLD",
      productionReady: false,
      launchedService: false,
      productionEnrollmentInspected: false,
    };
  }
  const claims = observation.claims || {};
  const claimsInterop = claims.portableKitInterop === true
    || claims.officialClientInterop === true
    || claims.productionReady === true;
  if (claimsInterop && !interopEarned(observation, surfaces)) {
    return { ...rejected("client_surfaces_are_not_portable_interop"), surfaces: surfaces.stamp, reasons: surfaces.reasons };
  }
  return {
    ok: true,
    exitCode: 0,
    code: "client_classified",
    productionActivate: "HOLD",
    productionReady: false,
    launchedService: false,
    surfaces,
  };
}

export function judgePublicClient(observation) {
  const judged = judgeClient(observation);
  if (!judged.ok) return judged;
  const facts = factsFrom(observation);
  if (facts.degradedMount) {
    return {
      ok: false,
      exitCode: 1,
      code: "degraded_mount",
      reason: facts.degradedReason,
      productionActivate: "HOLD",
      productionReady: false,
      launchedService: false,
      panelEnvRead: false,
      facts,
    };
  }
  if (!judged.surfaces.ok) {
    return {
      ok: false,
      exitCode: 1,
      code: "client_contract_unmet",
      reasons: judged.surfaces.reasons,
      productionActivate: "HOLD",
      productionReady: false,
      launchedService: false,
      facts,
    };
  }
  if (!facts.disabledOptionalMount || facts.hostedDiscovery || facts.taskResult || facts.durableRetrieval) {
    return {
      ok: false,
      exitCode: 1,
      code: "public_state_diverged",
      productionActivate: "HOLD",
      productionReady: false,
      launchedService: false,
      panelEnvRead: false,
      facts,
    };
  }
  return {
    ok: true,
    exitCode: 0,
    code: "public_client_compatible_foundry_inactive",
    productionActivate: "HOLD",
    productionReady: false,
    launchedService: false,
    panelEnvRead: false,
    toolsCalled: false,
    facts,
    surfaces: judged.surfaces.stamp,
  };
}
