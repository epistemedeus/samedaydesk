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
  const hz = healthz.body || {};
  const profileId = entry.body?.profile?.profileId;
  return {
    productionActivate: PRODUCTION_ACTIVATE,
    sdsHealth: {
      status: health.status,
      service: health.body?.service ?? null,
      ok: health.body?.ok === true,
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
    publicCatalog: null,
    task: null,
    retrieval: null,
  };
}
