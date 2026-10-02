/**
 * Bounded HTTPS transport for the public formation HTTP flow.
 * Refuses redirects, wrong-origin responses, oversized bodies, and credentialed URLs.
 */

export const DEFAULT_ORIGIN = "https://ein.llc";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
export const MAX_TIMEOUT_MS = 60_000;
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_BODY_BYTES = 32 * 1024;

export class HttpClientError extends Error {
  constructor({ status = null, code = "client_error", message, retryable = false, operation = null } = {}) {
    super(message || "request failed");
    this.name = "HttpClientError";
    this.status = status;
    this.code = code;
    this.retryable = retryable === true;
    this.operation = operation;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        retryable: this.retryable,
        ...(this.operation ? { operation: this.operation } : {}),
      },
    };
  }
}

export function parseOrigin(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new HttpClientError({ code: "invalid_input", message: "origin is required" });
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new HttpClientError({ code: "invalid_input", message: "origin must be a valid URL" });
  }
  const host = parsed.hostname;
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  if (parsed.protocol === "https:") {
    // ok
  } else if (parsed.protocol === "http:" && loopback) {
    // disposable local verify only
  } else {
    throw new HttpClientError({
      code: "invalid_input",
      message: "origin must be https (http allowed only for loopback disposable servers)",
    });
  }
  if (parsed.username || parsed.password) {
    throw new HttpClientError({ code: "invalid_input", message: "origin must not contain credentials" });
  }
  if (parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw new HttpClientError({
      code: "invalid_input",
      message: "origin must be a scheme+host without path, query, or fragment",
    });
  }
  return parsed.origin;
}

export async function readBoundedJson(response, maxBytes, signal) {
  const declared = response.headers?.get?.("content-length");
  if (declared && Number(declared) > maxBytes) {
    void response.body?.cancel?.().catch(() => {});
    throw new Error("response limit exceeded");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("response limit exceeded");
    return text ? JSON.parse(text) : undefined;
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("request timed out");
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("response limit exceeded");
      chunks.push(value);
    }
    if (size === 0) return undefined;
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function sameOrigin(responseUrl, expectedOrigin, requestUrl) {
  try {
    if (!responseUrl || responseUrl === requestUrl) return true;
    return new URL(responseUrl).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function isUnknownMutationStatus(status, payload) {
  if (status >= 200 && status < 300) return true;
  if (status >= 500) return true;
  return !(
    [400, 401, 403, 404, 409, 413, 429, 503].includes(status) &&
    typeof payload?.error === "string"
  );
}

function fallbackCode(status) {
  switch (status) {
    case 400:
      return "invalid_input";
    case 401:
      return "invalid_grant";
    case 403:
      return "insufficient_scope";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 413:
      return "body_limit";
    case 429:
      return "rate_limited";
    case 503:
      return "unavailable";
    default:
      return "unavailable";
  }
}

const PUBLIC_ERROR_CODES = new Set([
  "invalid_input",
  "invalid_grant",
  "insufficient_scope",
  "not_found",
  "conflict",
  "body_limit",
  "rate_limited",
  "unavailable",
]);

function publicFailureMessage(status) {
  if (status === 401) return "request was not authorized";
  if (status === 403) return "credential is not scoped to this request";
  if (status === 404) return "requested resource was not found";
  if (status === 409) return "request conflicts with current server state";
  if (status === 413) return "request body was rejected as too large";
  if (status === 429) return "request was rate limited";
  return `HTTP ${status}`;
}

/**
 * @param {object} opts
 * @param {string} opts.origin
 * @param {typeof fetch} opts.fetch
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxResponseBytes]
 */
export function createTransport({
  origin,
  fetch: fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
} = {}) {
  const resolvedOrigin = parseOrigin(origin);
  if (typeof fetchImpl !== "function") {
    throw new HttpClientError({ code: "invalid_input", message: "fetch implementation is required" });
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new HttpClientError({ code: "invalid_input", message: "invalid timeoutMs" });
  }
  if (
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes < 1 ||
    maxResponseBytes > MAX_RESPONSE_BYTES
  ) {
    throw new HttpClientError({ code: "invalid_input", message: "invalid maxResponseBytes" });
  }

  async function request(method, path, { body, grantToken, success, mutation = false, secrets = [] } = {}) {
    const accepted = Array.isArray(success) ? success : mutation ? [201] : [200];
    const url = `${resolvedOrigin}${path}`;
    const parsed = new URL(url);
    if (parsed.origin !== resolvedOrigin) {
      throw new HttpClientError({ code: "invalid_input", message: "refusing wrong-origin request URL" });
    }
    if (parsed.username || parsed.password) {
      throw new HttpClientError({ code: "invalid_input", message: "refusing credentialed URL" });
    }
    for (const secret of secrets) {
      if (secret && url.includes(secret)) {
        throw new HttpClientError({ code: "invalid_input", message: "refusing to send a credential in the URL" });
      }
    }

    let encodedBody;
    const headers = { Accept: "application/json" };
    if (body !== undefined) {
      encodedBody = JSON.stringify(body);
      if (Buffer.byteLength(encodedBody, "utf8") > MAX_BODY_BYTES) {
        throw new HttpClientError({
          status: 413,
          code: "body_limit",
          message: "request body exceeds 32 KiB",
        });
      }
      headers["Content-Type"] = "application/json";
    }
    if (grantToken) headers.Authorization = `Bearer ${grantToken}`;

    const controller = new AbortController();
    let timer;
    let response;
    let payload;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("request timed out"));
        }, timeoutMs);
      });
      await Promise.race([
        deadline,
        (async () => {
          response = await fetchImpl(url, {
            method,
            headers,
            body: encodedBody,
            redirect: "manual",
            signal: controller.signal,
          });
          if (
            controller.signal.aborted ||
            response.redirected ||
            (response.status >= 300 && response.status < 400) ||
            (response.url && !sameOrigin(response.url, resolvedOrigin, url))
          ) {
            void response.body?.cancel?.().catch(() => {});
            throw new Error("unexpected redirect or wrong origin");
          }
          if (response.status !== 204) {
            payload = await readBoundedJson(response, maxResponseBytes, controller.signal);
          }
        })(),
      ]);
    } catch {
      controller.abort();
      if (mutation) {
        throw new HttpClientError({
          code: "unknown_outcome",
          message:
            "Mutation result is unknown. Do not retry automatically. Reconcile before preparing again (each prepare creates a new application; the API has no idempotency key).",
          operation: `${method} ${path}`,
          retryable: false,
        });
      }
      throw new HttpClientError({
        code: "unavailable",
        message: "request failed or its response could not be read safely",
      });
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (!accepted.includes(status)) {
      if (mutation && isUnknownMutationStatus(status, payload)) {
        throw new HttpClientError({
          code: "unknown_outcome",
          message:
            "Mutation result is unknown. Do not retry automatically. Reconcile before preparing again (each prepare creates a new application; the API has no idempotency key).",
          operation: `${method} ${path}`,
          retryable: false,
        });
      }
      // Server error bodies are untrusted and may reflect request credentials or private input.
      const message = publicFailureMessage(status);
      const code =
        typeof payload?.code === "string" && PUBLIC_ERROR_CODES.has(payload.code)
          ? payload.code
          : fallbackCode(status);
      throw new HttpClientError({ status, code, message, retryable: false });
    }
    return { status, payload };
  }

  return { origin: resolvedOrigin, request };
}
