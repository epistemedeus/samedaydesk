import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatDigest, parseDigest, sha256File } from "./digest.mjs";
import {
  PUBLIC_EXACT_PATHS,
  PUBLIC_HOST,
  PUBLIC_PATH_PREFIXES,
  RFC3339_RE,
  REPO_ROOT,
} from "./pins.mjs";
import { isPlainObject } from "./walk.mjs";

export function isPublicConsumerUrl(value) {
  if (typeof value !== "string") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.hostname !== PUBLIC_HOST) return false;
  const path = url.pathname || "/";
  if (PUBLIC_EXACT_PATHS.includes(path)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function localPublicFile(url, repoRoot = REPO_ROOT) {
  if (!isPublicConsumerUrl(url)) return null;
  const parsed = new URL(url);
  const rel = urlPathToPublicRel(parsed.pathname);
  if (!rel) return null;
  const file = join(repoRoot, "client/public", rel);
  if (existsSync(file) && statSync(file).isFile()) return file;
  return null;
}

function urlPathToPublicRel(pathname) {
  const trimmed = String(pathname || "").replace(/^\/+/, "");
  return trimmed || null;
}

export function readCitation(value, { role }) {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${role} citation is required` };
  }
  const url = value.url;
  const observedAt = value.observedAt;
  const digest = parseDigest(value.digest);
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, error: `${role} citation needs a public URL` };
  }
  if (!isPublicConsumerUrl(url)) {
    return { ok: false, code: "citation-not-public", error: `${role} citation URL is not a public SDS consumer surface` };
  }
  if (typeof observedAt !== "string" || !RFC3339_RE.test(observedAt)) {
    return { ok: false, error: `${role} citation needs observedAt as UTC RFC3339` };
  }
  if (!digest) {
    return { ok: false, error: `${role} citation needs digest sha256:<hex>` };
  }
  return {
    ok: true,
    url,
    observedAt,
    digest,
    digestFormatted: formatDigest(digest),
  };
}

export function verifyLocalDigest(url, digestHex, repoRoot = REPO_ROOT) {
  const file = localPublicFile(url, repoRoot);
  if (!file) return { checked: false };
  const actual = sha256File(file);
  if (actual !== digestHex) {
    return {
      checked: true,
      ok: false,
      file,
      actual: formatDigest(actual),
    };
  }
  return { checked: true, ok: true, file, actual: formatDigest(actual) };
}
