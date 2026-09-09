import { readFileSync } from "node:fs";

export async function withRetries(fn, { retries = 2, delayMs = 0, shouldRetry } = {}) {
  let attempt = 0;
  let lastError = null;
  const attempts = [];
  while (attempt <= retries) {
    attempt += 1;
    try {
      const value = await fn(attempt);
      attempts.push({ attempt, ok: true });
      return { ok: true, value, attempts, retriesUsed: attempt - 1 };
    } catch (error) {
      lastError = error;
      const retryable = shouldRetry ? shouldRetry(error, attempt) : true;
      attempts.push({
        attempt,
        ok: false,
        retryable,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!retryable || attempt > retries) break;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return {
    ok: false,
    error: lastError instanceof Error ? lastError : new Error(String(lastError)),
    attempts,
    retriesUsed: Math.max(0, attempt - 1),
  };
}

export function loadFixtureSource(path) {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    return { kind: "json", path, body: JSON.parse(text), text };
  }
  return { kind: "text", path, text };
}

function isMountedOrigin(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(String(url));
}

const MAX_LIVE_RESPONSE_BYTES = 1024 * 1024;

function livePolicyError(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}

function isAllowedLiveUrl(url, allowMountedOrigin) {
  return url === "https://example.com/"
    || url === "https://example.com"
    || (allowMountedOrigin && isMountedOrigin(url));
}

async function readBoundedText(response, maxBytes = MAX_LIVE_RESPONSE_BYTES) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw livePolicyError(`live-safe response exceeds ${maxBytes} byte limit`);
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw livePolicyError(`live-safe response exceeds ${maxBytes} byte limit`);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return { text, bytes };
    } finally {
      reader.releaseLock?.();
    }
  }
  const text = await response.text();
  const bytes = Buffer.byteLength(text);
  if (bytes > maxBytes) throw livePolicyError(`live-safe response exceeds ${maxBytes} byte limit`);
  return { text, bytes };
}

export async function fetchLiveSafe(
  url,
  { fetchImpl = globalThis.fetch, timeoutMs = 8_000, allowMountedOrigin = false } = {},
) {
  if (!isAllowedLiveUrl(url, allowMountedOrigin)) {
    throw livePolicyError(`live-safe allowlist rejected url: ${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
    });
    if (response.status >= 300 && response.status < 400) {
      throw livePolicyError("live-safe redirects are not followed");
    }
    const finalUrl = response.url || url;
    if (!isAllowedLiveUrl(finalUrl, allowMountedOrigin)) {
      throw livePolicyError(`live-safe allowlist rejected final url: ${finalUrl}`);
    }
    const { text, bytes } = await readBoundedText(response);
    return {
      url,
      finalUrl,
      status: response.status,
      ok: response.ok,
      text,
      bytes,
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractedTagText(html, tag) {
  const match = String(html).match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  if (!match) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

export function extractComparableFields(htmlOrText, fields = ["title"]) {
  const text = String(htmlOrText ?? "");
  const out = {};
  for (const field of fields) {
    if (field === "title") {
      out.title = extractedTagText(text, "title");
    } else if (field === "h1") {
      out.h1 = extractedTagText(text, "h1");
    } else if (field === "bytes") {
      out.bytes = Buffer.byteLength(text);
    } else {
      out[field] = null;
    }
  }
  return out;
}
