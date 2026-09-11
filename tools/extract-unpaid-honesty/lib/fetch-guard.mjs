import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { inspectRequest } from "./inspect.mjs";

function logPath() {
  return process.env.HONESTY_INTERCEPT_LOG || "";
}

export function appendInterceptLog(entry) {
  const dest = logPath();
  if (!dest) return;
  appendFileSync(dest, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`);
}

export function honestyForbiddenError(hit) {
  const err = new Error(`extract-unpaid-honesty blocked: ${(hit.reasons || []).join(",")}`);
  err.code = "honesty_forbidden_request";
  err.hit = hit;
  return err;
}

function urlFromRequestOptions(options, fallbackProtocol) {
  if (typeof options === "string") return options;
  if (options instanceof URL) return options.href;
  if (options && typeof options.href === "string") return options.href;
  const protocol = String(options?.protocol || fallbackProtocol).replace(/:$/, "");
  const host = options?.hostname || options?.host || "127.0.0.1";
  const port = options?.port ? `:${options.port}` : "";
  const path = options?.path || "/";
  return `${protocol}://${host}${port}${path}`;
}

function patchProtocol(mod, fallbackProtocol) {
  if (mod.request.__honestyPatched) return;
  const origRequest = mod.request.bind(mod);
  const origGet = mod.get.bind(mod);
  const wrapped = function honestyRequest(options, callback) {
    const url = urlFromRequestOptions(options, fallbackProtocol);
    const headers = typeof options === "object" && options && !(options instanceof URL) ? options.headers : {};
    const method =
      (typeof options === "object" && options && options.method) || (fallbackProtocol === "http:" ? "GET" : "GET");
    const hit = inspectRequest({ url, method, headers });
    appendInterceptLog({ kind: `${fallbackProtocol}-request`, ...hit });
    if (hit.forbidden) throw honestyForbiddenError(hit);
    return origRequest(options, callback);
  };
  wrapped.__honestyPatched = true;
  mod.request = wrapped;
  mod.get = function honestyGet(options, callback) {
    const url = urlFromRequestOptions(options, fallbackProtocol);
    const headers = typeof options === "object" && options && !(options instanceof URL) ? options.headers : {};
    const hit = inspectRequest({ url, method: "GET", headers });
    appendInterceptLog({ kind: `${fallbackProtocol}-get`, ...hit });
    if (hit.forbidden) throw honestyForbiddenError(hit);
    return origGet(options, callback);
  };
  mod.get.__honestyPatched = true;
}

export function installFetchGuard() {
  if (globalThis.fetch && globalThis.fetch.__honestyPatched) {
    patchProtocol(http, "http:");
    patchProtocol(https, "https:");
    return;
  }
  const orig = globalThis.fetch;
  if (typeof orig !== "function") return;
  const patched = async function honestyFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = init.headers || (typeof input === "object" && input && input.headers) || {};
    const method = init.method || (typeof input === "object" && input && input.method) || "GET";
    const hit = inspectRequest({ url, method, headers });
    appendInterceptLog({ kind: "fetch", ...hit });
    if (hit.forbidden) throw honestyForbiddenError(hit);
    return orig(input, init);
  };
  patched.__honestyPatched = true;
  globalThis.fetch = patched;
  patchProtocol(http, "http:");
  patchProtocol(https, "https:");
}

if (process.env.HONESTY_INTERCEPT_LOG) {
  installFetchGuard();
}
