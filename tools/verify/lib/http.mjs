import { FORBIDDEN_HEADERS } from "./catalog.mjs";

export function classifyResponse({ status, headers, body, url }) {
  const server = header(headers, "server") || "";
  const text = typeof body === "string" ? body : "";
  const challengeHtml =
    /Checking your browser/i.test(text) ||
    /cf-browser-verification|hcdn|just a moment/i.test(text) ||
    /<title>\s*Attention Required/i.test(text);
  if ((status === 403 || status === 503) && (/hcdn/i.test(server) || challengeHtml)) {
    return "cdn_challenge";
  }
  if (challengeHtml && /hcdn|cloudflare/i.test(`${server}\n${text}`)) return "cdn_challenge";
  if (status === 402) return "payment_required";
  if (status >= 200 && status < 400) return "ok";
  return "http_error";
}

function header(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : "";
}

export function assertNoPaymentHeaders(headers = {}) {
  const names = Object.keys(headers);
  const hit = names.find((name) =>
    FORBIDDEN_HEADERS.some((forbidden) => forbidden.toLowerCase() === name.toLowerCase()),
  );
  if (hit) {
    const error = new Error(`forbidden payment header ${hit}`);
    error.code = "PAYMENT_HEADER";
    throw error;
  }
}

export async function httpRequest(url, { method = "GET", body = null, headers = {}, timeoutMs = 15_000 } = {}) {
  assertNoPaymentHeaders(headers);
  const upper = String(method || "GET").toUpperCase();
  try {
    const response = await fetch(url, {
      method: upper,
      body,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let json = null;
    const contentType = response.headers.get("content-type") || "";
    if (/json/i.test(contentType) || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const kind = classifyResponse({
      status: response.status,
      headers: response.headers,
      body: text,
      url,
    });
    return {
      url,
      method: upper,
      status: response.status,
      contentType,
      server: response.headers.get("server") || "",
      body: text,
      json,
      kind,
    };
  } catch (error) {
    return {
      url,
      method: upper,
      status: 0,
      contentType: "",
      server: "",
      body: error?.message || String(error),
      json: null,
      kind: "network",
    };
  }
}

export function previewBody(text, max = 240) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .slice(0, max);
}
