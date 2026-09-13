import { MAX_HTTP_BODY_BYTES } from "./pins.mjs";
import { ConsumerRefuse } from "./errors.mjs";
import { assertExecutionId, originResourceUrl, resolveRetrieval } from "./origin.mjs";
import { resultIdentityHash, sha256Text } from "./digest-named.mjs";
import { ticketFromSubmit } from "./ticket.mjs";

export { ticketFromSubmit };
export { ConsumerRefuse };

function errorCode(err) {
  let cur = err;
  const seen = new Set();
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    if (cur.code === "ECONNREFUSED") return "ECONNREFUSED";
    if (cur.code === "body-timeout") return "body-timeout";
    if (cur.code === "response-too-large") return "response-too-large";
    if (cur.code === "ABORT_ERR" || cur.name === "TimeoutError") return "timeout";
    const msg = cur.message || "";
    if (/redirect/i.test(msg)) return "redirect-disallowed";
    if (Array.isArray(cur.errors)) {
      for (const inner of cur.errors) {
        const nested = errorCode(inner);
        if (nested === "ECONNREFUSED") return "ECONNREFUSED";
        if (nested === "redirect-disallowed") return "redirect-disallowed";
      }
    }
    cur = cur.cause;
  }
  return err?.code || "fetch-failed";
}

function deliveryIncomplete(body) {
  const delivery = body?.delivery;
  if (!delivery || typeof delivery !== "object") return false;
  if (delivery.complete === false) return true;
  if (delivery.status === "incomplete") return true;
  if (Array.isArray(delivery.missing) && delivery.missing.length > 0) return true;
  return false;
}

export function classifyHttpExchange({ fetchError, status, body, parseError, consumeError } = {}) {
  if (fetchError) {
    const code = errorCode(fetchError);
    const mapped =
      code === "ECONNREFUSED"
        ? "connection-refused"
        : code === "timeout"
          ? "timeout"
          : code === "redirect-disallowed"
            ? "redirect-disallowed"
            : code;
    return {
      kind: "http-transport-failure",
      code: mapped,
      error: fetchError.message || String(fetchError),
    };
  }
  if (consumeError) {
    const code = errorCode(consumeError);
    return {
      kind: "http-transport-failure",
      code: code === "fetch-failed" ? "body-read-failed" : code,
      httpStatus: status,
      error: consumeError.message || String(consumeError),
    };
  }
  if (status >= 300 && status < 400) {
    return {
      kind: "http-transport-failure",
      code: "redirect-disallowed",
      httpStatus: status,
      body,
    };
  }
  if (parseError) {
    return {
      kind: "http-transport-failure",
      code: "non-json-body",
      httpStatus: status,
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
  if (status === 409) {
    return {
      kind: "http-transport-failure",
      code: body?.code || "execution-id-conflict",
      httpStatus: status,
      body,
    };
  }
  if (status === 410) {
    return {
      kind: "http-transport-failure",
      code: body?.code || "execution-expired",
      httpStatus: status,
      body,
    };
  }
  if (status === 413) {
    return {
      kind: "http-transport-failure",
      code: body?.code || "input-body-too-large",
      httpStatus: status,
      body,
    };
  }
  if (status === 503) {
    return {
      kind: "http-transport-failure",
      code: body?.code || "execution-cache-full",
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
  if (body.ok === true && deliveryIncomplete(body)) {
    return {
      kind: "incomplete-delivery",
      code: body.code || "incomplete-output",
      ok: false,
      analysis: body.analysis || null,
      transport: transport || null,
      delivery: body.delivery,
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

function abortError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function readTextBounded(response, { limit, bodyMs }) {
  const reason = abortError("body-timeout", "response body timed out");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(reason), bodyMs);
  const throwIfAborted = () => {
    if (ac.signal.aborted) throw ac.signal.reason || reason;
  };
  try {
    const stream = response.body;
    if (stream && typeof stream.getReader === "function") {
      const reader = stream.getReader();
      const chunks = [];
      let n = 0;
      while (true) {
        throwIfAborted();
        const outcome = await new Promise((resolve, reject) => {
          const onAbort = () => reject(ac.signal.reason || reason);
          if (ac.signal.aborted) {
            onAbort();
            return;
          }
          ac.signal.addEventListener("abort", onAbort, { once: true });
          reader.read().then(
            (value) => {
              ac.signal.removeEventListener("abort", onAbort);
              resolve(value);
            },
            (err) => {
              ac.signal.removeEventListener("abort", onAbort);
              reject(err);
            },
          );
        });
        if (outcome.done) break;
        const buf = Buffer.from(outcome.value);
        n += buf.length;
        if (n > limit) {
          try {
            await reader.cancel();
          } catch {
            /* already oversize */
          }
          throw abortError("response-too-large", "response body exceeds limit");
        }
        chunks.push(buf);
      }
      return Buffer.concat(chunks).toString("utf8");
    }
    const text = await response.text();
    throwIfAborted();
    if (Buffer.byteLength(text, "utf8") > limit) {
      throw abortError("response-too-large", "response body exceeds limit");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(response, { maxBodyBytes = MAX_HTTP_BODY_BYTES, bodyTimeoutMs = 30_000 } = {}) {
  let text;
  try {
    text = await readTextBounded(response, { limit: maxBodyBytes, bodyMs: bodyTimeoutMs });
  } catch (consumeError) {
    return { status: response.status, body: null, consumeError };
  }
  if (!text) return { status: response.status, body: null, parseError: null, empty: true };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { status: response.status, body: null, parseError: "non-json-body", rawText: text };
    }
    return {
      status: response.status,
      body,
      rawText: text,
      bodySha256: resultIdentityHash(body) || sha256Text(text),
    };
  } catch {
    return { status: response.status, body: null, parseError: "non-json-body", rawText: text };
  }
}

function classifiedResult({ status, body, parseError, consumeError, bodySha256 }) {
  return {
    status,
    body,
    bodySha256: bodySha256 || null,
    classify: classifyHttpExchange({ status, body, parseError, consumeError }),
  };
}

function validationFailure(err) {
  const code = err instanceof ConsumerRefuse ? err.code : err?.code || "invalid-origin";
  return {
    status: 0,
    body: null,
    bodySha256: null,
    classify: {
      kind: "http-transport-failure",
      code,
      error: err.message || String(err),
    },
  };
}

const FETCH_DEFAULTS = { redirect: "error" };

export async function getHealth(
  origin,
  { fetchImpl = fetch, timeoutMs = 15_000, bodyTimeoutMs = 15_000, maxBodyBytes = MAX_HTTP_BODY_BYTES } = {},
) {
  let target;
  try {
    target = originResourceUrl(origin, "/health");
  } catch (err) {
    return validationFailure(err);
  }
  try {
    const response = await fetchImpl(target.url, {
      method: "GET",
      ...FETCH_DEFAULTS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const read = await readJsonResponse(response, { maxBodyBytes, bodyTimeoutMs });
    return classifiedResult(read);
  } catch (fetchError) {
    return { status: 0, body: null, bodySha256: null, classify: classifyHttpExchange({ fetchError }) };
  }
}

export async function postExecute(
  origin,
  request,
  { fetchImpl = fetch, timeoutMs = 120_000, bodyTimeoutMs = 120_000, maxBodyBytes = MAX_HTTP_BODY_BYTES } = {},
) {
  let target;
  try {
    target = originResourceUrl(origin, "/execute");
    if (request?.executionId != null) assertExecutionId(request.executionId);
  } catch (err) {
    return validationFailure(err);
  }
  try {
    const response = await fetchImpl(target.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      ...FETCH_DEFAULTS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const read = await readJsonResponse(response, { maxBodyBytes, bodyTimeoutMs });
    return classifiedResult(read);
  } catch (fetchError) {
    return { status: 0, body: null, bodySha256: null, classify: classifyHttpExchange({ fetchError }) };
  }
}

export async function getResult(
  origin,
  retrievalPath,
  { fetchImpl = fetch, timeoutMs = 15_000, bodyTimeoutMs = 15_000, maxBodyBytes = MAX_HTTP_BODY_BYTES } = {},
) {
  let target;
  try {
    target = resolveRetrieval(origin, retrievalPath);
  } catch (err) {
    return validationFailure(err);
  }
  try {
    const response = await fetchImpl(target.url, {
      method: "GET",
      ...FETCH_DEFAULTS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const read = await readJsonResponse(response, { maxBodyBytes, bodyTimeoutMs });
    return { ...classifiedResult(read), retrieval: { id: target.id, path: target.path, origin: target.origin } };
  } catch (fetchError) {
    return { status: 0, body: null, bodySha256: null, classify: classifyHttpExchange({ fetchError }) };
  }
}

