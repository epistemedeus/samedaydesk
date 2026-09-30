import { PRODUCTION_ACTIVATE } from "./classify.mjs";

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getJson(origin, path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, body: await readJson(response) };
}

async function postJson(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, body: await readJson(response) };
}

function facadeBody(body) {
  if (!body || typeof body !== "object") return null;
  return {
    optIn: body.optIn ?? null,
    facade: body.facade ?? null,
    rawMounted: body.rawMounted ?? null,
    publicExecution: body.publicExecution ?? null,
    extension: body.extension ?? null,
    schema: body.schema ?? null,
    wholeHostSandbox: body.wholeHostSandbox ?? null,
  };
}

export async function observeOrigin(origin) {
  const health = await getJson(origin, "/api/health");
  const healthz = await getJson(origin, "/api/correspondence/healthz");
  const receiver = await getJson(origin, "/api/correspondence/foundry-receiver");
  const entry = await getJson(origin, "/api/correspondence/v1/visitor-entry");
  const uploads = await fetch(`${origin}/api/uploads/signed-url`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  const mcp = await postJson(origin, "/mcp", {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "sds-foundry-activation", version: "0" },
    },
  });
  const hz = healthz.body || {};
  const configured = health.body?.configured || {};
  const profileId = entry.body?.profile?.profileId;
  const serverInfo = mcp.body?.result?.serverInfo || {};
  return {
    productionActivate: PRODUCTION_ACTIVATE,
    sdsHealth: {
      status: health.status,
      service: health.body?.service ?? null,
      ok: health.body?.ok === true,
      configured: {
        supabase: configured.supabase,
        stripe: configured.stripe,
        email: configured.email,
      },
    },
    correspondenceHealthz: {
      status: healthz.status,
      body: {
        ok: hz.ok === true,
        enabled: hz.enabled === true,
        reason: typeof hz.reason === "string" ? hz.reason : null,
        store: typeof hz.store === "string" ? hz.store : null,
      },
    },
    foundryReceiver: {
      status: receiver.status,
      body: receiver.status === 200 ? facadeBody(receiver.body) : null,
    },
    visitorEntry: {
      status: entry.status,
      hasProfile: typeof profileId === "string" && profileId.length > 0,
    },
    uploads: { status: uploads.status },
    mcp: {
      status: mcp.status,
      protocolVersion: mcp.body?.result?.protocolVersion ?? null,
      serverName: typeof serverInfo.name === "string" ? serverInfo.name : null,
      serverVersion: typeof serverInfo.version === "string" ? serverInfo.version : null,
      toolsCalled: false,
    },
    publicCatalog: null,
    task: null,
    retrieval: null,
  };
}
