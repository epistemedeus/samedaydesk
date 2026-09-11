import { USER_AGENT } from "./constants.mjs";
import { sha256Bytes } from "./hash.mjs";
import { nowIso } from "./clock.mjs";

export async function httpGet(
  url,
  { timeoutMs = 15000, headers = {}, accept = "application/json", now } = {},
) {
  const fetchedAt = nowIso(now);
  if (typeof fetch !== "function") {
    return {
      ok: false,
      httpStatus: null,
      body: null,
      fetchedAt,
      sha256: null,
      error: "fetch_unavailable",
    };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        ...headers,
      },
      signal: ac.signal,
      redirect: "follow",
    });
    const body = Buffer.from(await res.arrayBuffer());
    return {
      ok: res.ok,
      httpStatus: res.status,
      body,
      fetchedAt,
      sha256: sha256Bytes(body),
      error: res.ok ? null : `http_${res.status}`,
    };
  } catch (err) {
    const msg = err && err.name === "AbortError" ? "timeout" : String(err?.message || err);
    return {
      ok: false,
      httpStatus: null,
      body: null,
      fetchedAt,
      sha256: null,
      error: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function jsonBody(result) {
  if (!result?.body) return null;
  try {
    return JSON.parse(Buffer.from(result.body).toString("utf8"));
  } catch {
    return null;
  }
}
