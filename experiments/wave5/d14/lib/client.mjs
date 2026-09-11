import { EXECUTION_CONTRACT_VERSION } from "./pins.mjs";

function errorCode(err) {
  let cur = err;
  const seen = new Set();
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    if (cur.code === "ECONNREFUSED") return "ECONNREFUSED";
    if (Array.isArray(cur.errors)) {
      for (const inner of cur.errors) {
        const nested = errorCode(inner);
        if (nested === "ECONNREFUSED") return "ECONNREFUSED";
      }
    }
    cur = cur.cause;
  }
  return err?.code || "fetch-failed";
}

export function classifyHttpExchange({ fetchError, status, body }) {
  if (fetchError) {
    const code = errorCode(fetchError);
    const mapped = code === "ECONNREFUSED" ? "connection-refused" : code;
    return {
      kind: "http-transport-failure",
      code: mapped,
      error: fetchError.message || String(fetchError),
    };
  }
  if (status === 400) {
    return {
      kind: "http-transport-failure",
      code: body?.code || "invalid-json",
      httpStatus: status,
      body,
    };
  }
  if (status === 404) {
    return {
      kind: "http-transport-failure",
      code: body?.code || "not-found",
      httpStatus: status,
      body,
    };
  }
  if (status !== 200) {
    return {
      kind: "http-transport-failure",
      code: "unexpected-http-status",
      httpStatus: status,
      body,
    };
  }
  if (!body || typeof body !== "object") {
    return { kind: "http-transport-failure", code: "non-json-body", httpStatus: status };
  }

  const transport = body.transport;
  if (transport && transport !== "ok" && transport !== "rejected") {
    return {
      kind: "execution-transport-failure",
      transport,
      code: body.code || transport,
      body,
    };
  }
  if (body.ok === true) {
    return {
      kind: "analysis-outcome",
      ok: true,
      analysis: body.analysis || null,
      transport: transport || null,
      body,
    };
  }
  return {
    kind: "contract-refusal",
    code: body.code || "ok-false",
    transport: transport || null,
    analysis: body.analysis || null,
    sold: body.sold === true,
    body,
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return { status: response.status, body: null };
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { raw: text } };
  }
}

export async function getHealth(origin, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  try {
    const response = await fetchImpl(new URL("/health", origin), {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const { status, body } = await readJsonResponse(response);
    return { status, body, classify: classifyHttpExchange({ status, body }) };
  } catch (fetchError) {
    return { status: 0, body: null, classify: classifyHttpExchange({ fetchError }) };
  }
}

export async function postExecute(origin, request, { fetchImpl = fetch, timeoutMs = 120_000 } = {}) {
  try {
    const response = await fetchImpl(new URL("/execute", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const { status, body } = await readJsonResponse(response);
    return { status, body, classify: classifyHttpExchange({ status, body }) };
  } catch (fetchError) {
    return { status: 0, body: null, classify: classifyHttpExchange({ fetchError }) };
  }
}

export async function getResult(origin, retrievalPath, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const path = retrievalPath.startsWith("/") ? retrievalPath : `/results/${retrievalPath}`;
  try {
    const response = await fetchImpl(new URL(path, origin), {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const { status, body } = await readJsonResponse(response);
    return { status, body, classify: classifyHttpExchange({ status, body }) };
  } catch (fetchError) {
    return { status: 0, body: null, classify: classifyHttpExchange({ fetchError }) };
  }
}

export function ticketFromSubmit({ origin, request, submitted, posted }) {
  const body = posted.body || {};
  return {
    contract: body.contract || EXECUTION_CONTRACT_VERSION,
    origin,
    jobId: request.jobId,
    retrieval: body.retrieval || null,
    executionId: body.executionId || body.retrieval?.id || null,
    submitted,
    classify: posted.classify,
    httpStatus: posted.status,
  };
}
