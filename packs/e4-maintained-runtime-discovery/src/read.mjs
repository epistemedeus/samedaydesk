import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, isFailure } from "./failures.mjs";
import { FETCH_TIMEOUT_MS, MAX_BODY_BYTES, SURFACES } from "./surfaces.mjs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, SURFACES.discovery.committedRel))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function readCommittedSurface(surface, repoRoot) {
  const root = repoRoot || findRepoRoot();
  if (!root) {
    return fail("committed_surfaces_unavailable", "client/public/discovery/useful-jobs.json not found");
  }
  if (!surface.committedRel) {
    return fail("committed_surfaces_unavailable", `${surface.id} has no committed file`);
  }
  const path = join(root, surface.committedRel);
  if (!existsSync(path)) {
    return fail("committed_surfaces_unavailable", `missing ${surface.committedRel}`, { path });
  }
  const buf = readFileSync(path);
  if (buf.length > MAX_BODY_BYTES) {
    return fail("body_too_large", `body ${buf.length} exceeds ${MAX_BODY_BYTES}`, { path });
  }
  return {
    ok: true,
    surface: surface.id,
    source: "committed",
    path,
    url: surface.url,
    status: 200,
    bytes: buf.length,
    sha256: sha256Bytes(buf),
    body: buf.toString("utf8"),
  };
}

async function readBoundedBody(res, url) {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await res.body?.cancel?.().catch(() => {});
    return fail("body_too_large", `content-length ${declared} exceeds ${MAX_BODY_BYTES}`, { url });
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    try {
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length > MAX_BODY_BYTES) {
        return fail("body_too_large", `body ${buf.length} exceeds ${MAX_BODY_BYTES}`, { url });
      }
      return { ok: true, buf };
    } catch (err) {
      return fail("transport_error", err?.message || "body read failed", { url });
    }
  }
  const reader = res.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return fail("body_too_large", `body ${bytes} exceeds ${MAX_BODY_BYTES}`, { url });
      }
      chunks.push(Buffer.from(part.value));
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    return fail("transport_error", err?.message || "body read failed", { url });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel() already released the lock
    }
  }
  return { ok: true, buf: bytes ? Buffer.concat(chunks, bytes) : Buffer.alloc(0) };
}

export async function fetchSurface(surface, { fetchImpl = fetch } = {}) {
  const observedAt = new Date().toISOString();
  let res;
  try {
    res = await fetchImpl(surface.url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: surface.kind === "json" ? "application/json" : "text/plain, text/markdown" },
    });
  } catch (err) {
    return fail("transport_error", err?.message || "fetch failed", {
      url: surface.url,
      observedAt,
    });
  }
  if (res.url && res.url !== surface.url) {
    await res.body?.cancel?.().catch(() => {});
    return fail("unexpected_response_url", `final URL ${res.url} is not ${surface.url}`, {
      url: surface.url,
      finalUrl: res.url,
    });
  }
  if (!res.ok) {
    await res.body?.cancel?.().catch(() => {});
    return fail("http_error", `HTTP ${res.status} from ${surface.url}`, {
      url: surface.url,
      httpStatus: res.status,
      observedAt,
    });
  }
  const bounded = await readBoundedBody(res, surface.url);
  if (isFailure(bounded)) return bounded;
  const buf = bounded.buf;
  return {
    ok: true,
    surface: surface.id,
    source: "live",
    url: surface.url,
    status: res.status,
    observedAt,
    bytes: buf.length,
    sha256: sha256Bytes(buf),
    body: buf.toString("utf8"),
  };
}

export function readFixtureFile(path) {
  if (!existsSync(path)) {
    return fail("usage", `fixture not found: ${path}`, { path });
  }
  const buf = readFileSync(path);
  if (buf.length > MAX_BODY_BYTES) {
    return fail("body_too_large", `body ${buf.length} exceeds ${MAX_BODY_BYTES}`, { path });
  }
  return {
    ok: true,
    surface: "discovery",
    source: "fixture",
    path,
    status: 200,
    bytes: buf.length,
    sha256: sha256Bytes(buf),
    body: buf.toString("utf8"),
  };
}
