import { ERROR_CODES } from "./constants.mjs";
import { ProgressError } from "./errors.mjs";

function originOf(url) {
  return new URL(url).origin;
}

/**
 * Injected GET adapter for GET /v1/tasks/{id} only.
 * Refuses artifact.ref and any other URL. Does not execute artifacts.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   baseUrl: string,
 *   bearer?: string | null,
 *   artifactRefs?: string[],
 * }} options
 */
export function createTaskPollAdapter(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl;
  if (typeof baseUrl !== "string" || !baseUrl) {
    throw new ProgressError(ERROR_CODES.INVALID_INPUT, "baseUrl is required for poll");
  }
  const base = new URL(baseUrl);
  const forbidden = new Set((options.artifactRefs ?? []).filter((value) => typeof value === "string" && value));
  const calls = [];

  async function adapter(url, init = {}) {
    const target = new URL(url, base);
    const method = String(init.method ?? "GET").toUpperCase();
    calls.push({ url: target.href, method });

    for (const ref of forbidden) {
      if (target.href === ref || target.href.startsWith(ref) || ref === target.href) {
        throw new ProgressError(
          ERROR_CODES.FETCH_REF_FORBIDDEN,
          "poll adapter refused to fetch artifact.ref",
        );
      }
      try {
        if (new URL(ref).href === target.href) {
          throw new ProgressError(
            ERROR_CODES.FETCH_REF_FORBIDDEN,
            "poll adapter refused to fetch artifact.ref",
          );
        }
      } catch (error) {
        if (error instanceof ProgressError) throw error;
      }
    }

    if (method !== "GET") {
      throw new ProgressError(
        ERROR_CODES.FETCH_REF_FORBIDDEN,
        "poll adapter only GET /v1/tasks/{id}; it does not POST submissions or fetch refs",
      );
    }
    if (originOf(target) !== originOf(base)) {
      throw new ProgressError(
        ERROR_CODES.FETCH_REF_FORBIDDEN,
        "poll adapter refuses cross-origin URLs (including artifact.ref)",
      );
    }
    const path = target.pathname.replace(/\/$/, "") || "/";
    const taskPath = /^\/v1\/tasks\/[^/]+$/.test(path);
    const health = path === "/healthz";
    if (!taskPath && !health) {
      throw new ProgressError(
        ERROR_CODES.FETCH_REF_FORBIDDEN,
        "poll adapter only GET /v1/tasks/{id} or /healthz",
      );
    }

    const headers = new Headers(init.headers);
    if (options.bearer && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${options.bearer}`);
    }
    return fetchImpl(target.href, { ...init, method: "GET", headers });
  }

  adapter.calls = calls;
  adapter.forbidRef = (ref) => {
    if (ref) forbidden.add(ref);
  };
  return adapter;
}

export function assertFetchRefForbidden(options = {}) {
  if (options.fetchRef === true || options.fetch === "ref") {
    throw new ProgressError(ERROR_CODES.FETCH_REF_FORBIDDEN, "this pack never fetches artifact.ref");
  }
}
