import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/mcp-registry-consumer",
);
export const OFFICIAL_META_KEY = "io.modelcontextprotocol.registry/official";
export const SERVER_NAME = "io.github.epistemedeus/x402-data-gateway";
export const CURRENT_REMOTE = "https://agents.samedaydesk.com/mcp";
export const HISTORICAL_RAILWAY_REMOTE =
  "https://x402-url-extractor-production.up.railway.app/mcp";
export const VERSIONS_LATEST_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.epistemedeus%2Fx402-data-gateway/versions/latest";
export const SEARCH_UNFILTERED_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers?search=x402-data-gateway";
export const SEARCH_VERSION_LATEST_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers?search=x402-data-gateway&version=latest";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

export function fixturePath(name) {
  return join(FIXTURE_DIR, name);
}

export function loadCaptureMeta() {
  return JSON.parse(readFileSync(fixturePath("capture.json"), "utf8"));
}

export function loadFixture(name) {
  return JSON.parse(readFileSync(fixturePath(name), "utf8"));
}

export function officialMeta(entry) {
  return entry?._meta?.[OFFICIAL_META_KEY] || {};
}

export function serverOf(entry) {
  return entry?.server || null;
}

export function remoteUrl(entry) {
  return serverOf(entry)?.remotes?.[0]?.url || null;
}

export function versionOf(entry) {
  return serverOf(entry)?.version || null;
}

/** Naive consumer pitfall: first page hit of an unfiltered search. */
export function firstSearchHit(listBody) {
  return listBody?.servers?.[0] ?? null;
}

export function latestSearchHits(listBody) {
  return (listBody?.servers || []).filter((item) => officialMeta(item).isLatest === true);
}

export function matchesPin(entry, pin) {
  const meta = officialMeta(entry);
  return (
    versionOf(entry) === pin.version &&
    remoteUrl(entry) === pin.remote &&
    meta.isLatest === pin.isLatest &&
    meta.updatedAt === pin.updatedAt
  );
}

/**
 * True only if a caller who took servers[0] would believe they have the
 * current SameDayDesk remote. That must stay false for unfiltered search.
 */
export function firstHitLooksLikeCurrentLatest(listBody, currentRemote = CURRENT_REMOTE) {
  const hit = firstSearchHit(listBody);
  if (!hit) return false;
  return officialMeta(hit).isLatest === true && remoteUrl(hit) === currentRemote;
}

export async function liveGetJson(url, { timeoutMs = 20000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "error",
      signal: ac.signal,
      headers: {
        accept: "application/json",
        "user-agent": "samedaydesk-mcp-registry-consumer/1.0",
      },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      sha256: sha256Bytes(Buffer.from(text)),
      body: text ? JSON.parse(text) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}
