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

export async function fetchLiveSafe(
  url,
  { fetchImpl = globalThis.fetch, timeoutMs = 8_000, allowMountedOrigin = false } = {},
) {
  const allowed = new Set(["https://example.com/", "https://example.com"]);
  if (!allowed.has(url) && !(allowMountedOrigin && isMountedOrigin(url))) {
    throw new Error(`live-safe allowlist rejected url: ${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
    });
    const text = await response.text();
    return {
      url,
      finalUrl: response.url || url,
      status: response.status,
      ok: response.ok,
      text,
      bytes: Buffer.byteLength(text),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function extractComparableFields(htmlOrText, fields = ["title"]) {
  const text = String(htmlOrText ?? "");
  const out = {};
  for (const field of fields) {
    if (field === "title") {
      const match = text.match(/<title[^>]*>([^<]*)<\/title>/i);
      out.title = match ? match[1].trim() : null;
    } else if (field === "h1") {
      const match = text.match(/<h1[^>]*>([^<]*)<\/h1>/i);
      out.h1 = match ? match[1].trim() : null;
    } else if (field === "bytes") {
      out.bytes = Buffer.byteLength(text);
    } else {
      out[field] = null;
    }
  }
  return out;
}
