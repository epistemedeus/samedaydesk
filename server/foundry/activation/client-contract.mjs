import { factsFrom } from "./classify.mjs";

export const PRODUCT_DATA_PROJECT_REF = "arvmcttdegqwiwdaembr";
export const PRODUCT_DATA_HOST = `${PRODUCT_DATA_PROJECT_REF}.supabase.co`;
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
  /re_[A-Za-z0-9]{8,}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /service_role/i,
  /sb_secret_/i,
];

function rejected(reason) {
  return {
    ok: false,
    exitCode: 2,
    code: "false_green_rejected",
    reason,
    productionActivate: "HOLD",
    productionReady: false,
    secretsCopied: false,
    launchedService: false,
  };
}

export function findSecret(value) {
  if (typeof value === "string") {
    return SECRET_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) return value.some((item) => findSecret(item));
  if (value && typeof value === "object") return Object.values(value).some((item) => findSecret(item));
  return false;
}

export function reusesProductDataService(databaseUrl) {
  const text = String(databaseUrl || "").trim();
  return text.length > 0 && text.includes(PRODUCT_DATA_PROJECT_REF);
}

export function correspondenceReuse(metadata) {
  const candidates = [
    metadata?.correspondenceDatabaseUrl,
    metadata?.correspondenceDataService?.url,
    metadata?.env?.CORRESPONDENCE_DATABASE_URL,
  ];
  return candidates.some((item) => reusesProductDataService(item));
}

export function clientSurfaces(observation) {
  const health = observation?.sdsHealth || {};
  const configured = health.configured || {};
  const mcp = observation?.mcp || {};
  const reasons = [];
  if (health.status !== 200 || health.service !== "samedaydesk" || health.ok !== true) reasons.push("sds_health");
  for (const key of ["supabase", "stripe", "email"]) {
    if (typeof configured[key] !== "boolean") reasons.push(`configured_${key}`);
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
  if (metadata.productionReady === true || metadata.hostingerChanged === true || metadata.launchedService === true) {
    return rejected("production_ready_claim");
  }
  if (metadata.hostingerApiReread === true || metadata.citedBuild?.apiReread === true || metadata.panelEnvRead === true) {
    return rejected("panel_read_not_evidenced");
  }
  if (correspondenceReuse(metadata)) return rejected("correspondence_reuses_product_data_service");
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
  if (!observation || observation.productionActivate !== "HOLD") return rejected("production_activate_not_hold");
  if (observation.productionReady === true) return rejected("production_ready_claim");
  const surfaces = clientSurfaces(observation);
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
