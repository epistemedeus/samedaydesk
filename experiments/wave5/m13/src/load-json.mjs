import { readFileSync } from "node:fs";

export async function loadJson(source, { timeoutMs = 15000 } = {}) {
  if (source && typeof source === "object") return source;
  if (typeof source !== "string" || source.length === 0) {
    const err = new Error("json source is required");
    err.code = "missing-source";
    throw err;
  }
  if (/^https?:\/\//i.test(source)) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(source, {
        redirect: "error",
        signal: ac.signal,
        headers: {
          accept: "application/json",
          "user-agent": "samedaydesk-w5-m13-discover/0.1",
        },
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`GET ${source} HTTP ${res.status}`);
        err.code = "http-error";
        err.status = res.status;
        throw err;
      }
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }
  return JSON.parse(readFileSync(source, "utf8"));
}
