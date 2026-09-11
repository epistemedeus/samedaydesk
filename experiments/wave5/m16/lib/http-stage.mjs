import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { trialTransport } from "./errors.mjs";

export async function fetchLockUrl(url, destPath, { timeoutMs = 15_000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "error" });
    if (!res.ok) {
      throw trialTransport("http-fetch-failed", `${url} returned ${res.status}`, { url, status: res.status });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buf);
    return { path: destPath, bytes: buf.length };
  } catch (err) {
    if (err.name === "TrialTransport") throw err;
    throw trialTransport("http-fetch-failed", `${url} fetch failed: ${err.message}`, { url });
  } finally {
    clearTimeout(t);
  }
}

export async function stageFromUrls({ beforeUrl, afterUrl, destDir }) {
  mkdirSync(join(destDir, "before"), { recursive: true });
  mkdirSync(join(destDir, "after"), { recursive: true });
  const beforePath = join(destDir, "before", "package-lock.json");
  const afterPath = join(destDir, "after", "package-lock.json");
  await fetchLockUrl(beforeUrl, beforePath);
  await fetchLockUrl(afterUrl, afterPath);
  return { beforePath, afterPath };
}
