/** SPDX-License-Identifier: MIT
 * Bounded requests. Size, redirect, and origin checks reuse the public client.
 * Bound-prepare failures stay unknown until the same operation is replayed.
 */
import { ContinuationError, recovery } from "./errors.mjs";
import { publicClient } from "./locate.mjs";

const SERVER_CODES = new Set([
  "assessment_not_found",
  "assessment_facts_mismatch",
  "intended_recipient_mismatch",
  "assessment_expired",
  "assessment_already_bound",
  "operation_identity_conflict",
  "operation_payload_mismatch",
  "incomplete_assessment_not_claimable",
  "not_claimed",
  "secret_field_rejected",
  "prepare_failpoint",
  "service_configuration_error",
  "email_not_verified",
  "claim_token_query_is_not_accepted",
]);

const KNOWN_FAILURE = new Set([400, 401, 403, 404, 409, 413, 429, 503]);

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

function failureMessage(status) {
  if (status === 401) return "request was not authorized";
  if (status === 403) return "credential is not scoped to this request";
  if (status === 404) return "requested resource was not found";
  if (status === 409) return "request conflicts with current server state";
  if (status === 413) return "request body was rejected as too large";
  if (status === 429) return "request was rate limited";
  return `HTTP ${status}`;
}

function isUnknownMutation(status, payload) {
  if (status >= 200 && status < 300) return true;
  if (status >= 500) return true;
  return !(KNOWN_FAILURE.has(status) && typeof payload?.error === "string");
}

export async function createApiTransport({
  apiOrigin,
  fetch: fetchImpl,
  timeoutMs,
  maxResponseBytes,
} = {}) {
  const { http } = await publicClient();
  const origin = http.parseOrigin(apiOrigin);
  const timeout = timeoutMs ?? http.DEFAULT_TIMEOUT_MS;
  const maxBytes = maxResponseBytes ?? http.DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(timeout) || timeout < 50 || timeout > http.MAX_TIMEOUT_MS) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "timeout is outside 50ms..60s",
      recovery: recovery("fix_input", "Set EIN_CONTINUATION_TIMEOUT_MS between 50 and 60000."),
    });
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > http.MAX_RESPONSE_BYTES) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "response limit is outside the public client maximum",
      recovery: recovery("fix_input", "Set EIN_CONTINUATION_MAX_RESPONSE_BYTES within the public client limit."),
    });
  }
  if (typeof fetchImpl !== "function") {
    throw new ContinuationError({
      code: "invalid_input",
      message: "fetch implementation is required",
      recovery: recovery("fix_input", "Run on Node 22+ with global fetch."),
    });
  }

  // This transport is shared by every setup and operation read in one command.
  // Count wire bytes, including JSON whitespace, before parsing or projecting.
  let responseBytes = 0;
  function countedResponse(response) {
    const count = (size) => { responseBytes += size; };
    if (!response.body?.getReader) {
      return { headers: response.headers, text: async () => {
        const text = await response.text();
        count(Buffer.byteLength(text, "utf8"));
        return text;
      } };
    }
    return { headers: response.headers, body: {
      cancel: () => response.body.cancel(),
      getReader() {
        const reader = response.body.getReader();
        return {
          async read() {
            const step = await reader.read();
            if (!step.done) count(step.value.byteLength);
            return step;
          },
          cancel: () => reader.cancel(),
          releaseLock: () => reader.releaseLock(),
        };
      },
    } };
  }

  async function request(method, path, { body, grantToken, success, mutation = false, secrets = [], headers: extraHeaders = {}, decide = null } = {}) {
    const accepted = Array.isArray(success) ? success : mutation ? [201] : [200];
    const url = `${origin}${path}`;
    const parsed = new URL(url);
    if (parsed.origin !== origin || parsed.username || parsed.password) {
      throw new ContinuationError({
        code: "origin_mismatch",
        message: "refusing a request URL that leaves the API origin or embeds credentials",
        recovery: recovery("stop", "Do not send this request."),
      });
    }
    for (const secret of secrets) {
      if (secret && url.includes(secret)) {
        throw new ContinuationError({
          code: "invalid_input",
          message: "refusing to send a credential in the URL",
          recovery: recovery("stop", "Pass the grant only in the Authorization header, from the grant file or environment."),
        });
      }
    }

    let encodedBody;
    const headers = { Accept: "application/json" };
    if (body !== undefined) {
      encodedBody = JSON.stringify(body);
      if (Buffer.byteLength(encodedBody, "utf8") > http.MAX_BODY_BYTES) {
        throw new ContinuationError({
          status: 413,
          code: "body_limit",
          message: "request body exceeds 32 KiB",
          recovery: recovery("fix_input", "Send only the non-sensitive task fields. Do not attach documents or secrets."),
        });
      }
      headers["Content-Type"] = "application/json";
    }
    if (grantToken) headers.Authorization = `Bearer ${grantToken}`;
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (value != null) headers[name] = value;
    }

    const controller = new AbortController();
    let timer;
    let timedOut = false;
    let response;
    let payload;
    const fail = (error) => {
      const message = error instanceof Error ? error.message : "";
      const aborted = timedOut || error?.name === "AbortError" || message === "request timed out";
      if (message === "unexpected redirect or wrong origin") {
        throw new ContinuationError({
          code: "redirect_refused",
          message: "refusing a redirect or a response from another origin",
          operation: `${method} ${path}`,
          recovery: recovery("stop", "Do not follow the redirect. Call the API origin recorded for this task."),
        });
      }
      if (message === "response limit exceeded") {
        if (mutation) {
          throw new ContinuationError({
            code: "unknown_outcome",
            causeCode: "body_limit",
            message: "Mutation response exceeded the size limit before it could be read.",
            operation: `${method} ${path}`,
            recovery: recovery(
              "replay_same_bound_prepare",
              "Replay the same bound prepare later. Do not choose a new operation id.",
            ),
          });
        }
        throw new ContinuationError({
          code: "body_limit",
          message: "response exceeded the size limit and was discarded",
          operation: `${method} ${path}`,
          recovery: recovery("retry_read", "Retry this read once the origin returns a bounded body. Do not prepare because a read was oversized."),
        });
      }
      if (aborted) {
        if (mutation) {
          throw new ContinuationError({
            code: "unknown_outcome",
            causeCode: "timeout",
            message: "Mutation timed out before a complete response.",
            operation: `${method} ${path}`,
            recovery: recovery(
              "replay_same_bound_prepare",
              "The server may have stored the case. Replay the same assessment, recipient, and operation id. Do not mint another.",
            ),
          });
        }
        throw new ContinuationError({
          code: "timeout",
          message: "request timed out before a complete response",
          operation: `${method} ${path}`,
          recovery: recovery("retry_read", "Run the same read again. A stalled body is not a new task and not a login."),
        });
      }
      if (mutation) {
        throw new ContinuationError({
          code: "unknown_outcome",
          message: "Mutation result is unknown.",
          operation: `${method} ${path}`,
          recovery: recovery(
            "replay_same_bound_prepare",
            "Replay the same bound prepare. An unknown reply is not permission to create another application.",
          ),
        });
      }
      throw new ContinuationError({
        code: "unavailable",
        message: "request failed or its response could not be read safely",
        operation: `${method} ${path}`,
        recovery: recovery("retry_read", "Run the same read again. Do not prepare because a read failed."),
      });
    };

    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("request timed out"));
        }, timeout);
      });
      const work = (async () => {
          response = await fetchImpl(url, {
            method,
            headers,
            body: encodedBody,
            redirect: "manual",
            signal: controller.signal,
          });
          const responseUrl = response.url || url;
          let responseOrigin = origin;
          try {
            responseOrigin = new URL(responseUrl).origin;
          } catch {
            responseOrigin = "";
          }
          if (
            response.redirected ||
            response.type === "opaqueredirect" ||
            (response.status >= 300 && response.status < 400) ||
            (responseUrl !== url && responseOrigin !== origin)
          ) {
            void response.body?.cancel?.().catch(() => {});
            throw new Error("unexpected redirect or wrong origin");
          }
          if (response.status !== 204) {
            payload = await http.readBoundedJson(countedResponse(response), Math.max(0, maxBytes - responseBytes), controller.signal);
          }
        })();
      try {
        await Promise.race([deadline, work]);
      } finally {
        work.catch(() => {});
      }
    } catch (error) {
      timedOut = timedOut || error?.name === "AbortError";
      controller.abort();
      fail(error);
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (typeof decide === "function") {
      const decided = decide(status, payload);
      if (decided === "accept") return { status, payload };
      if (decided instanceof ContinuationError) throw decided;
    }
    if (!accepted.includes(status)) {
      if (mutation && isUnknownMutation(status, payload)) {
        throw new ContinuationError({
          code: "unknown_outcome",
          status,
          message: "Mutation result is unknown.",
          operation: `${method} ${path}`,
          recovery: recovery(
            "replay_same_bound_prepare",
            "Replay the same bound prepare. Do not choose a new operation id.",
          ),
        });
      }
      const code =
        typeof payload?.code === "string" && SERVER_CODES.has(payload.code) ? payload.code : fallbackCode(status);
      throw new ContinuationError({
        status,
        code,
        message: failureMessage(status),
        operation: `${method} ${path}`,
      });
    }
    return { status, payload };
  }

  return { origin, request };
}
