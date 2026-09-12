import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

/**
 * Default F08-compatible named-bytes digest.
 * Matches server/paid-useful-jobs/lib/digest.mjs at tested SHA aeef964
 * (kind + null bytes/sha256; directory path only). Inject the live module
 * when a F08 worktree is present rather than trusting this fallback blindly.
 */
export function digestNamedBytes(entries) {
  const rows = [...entries]
    .map((e) => ({
      name: e.name,
      kind: e.kind || "file",
      bytes: e.bytes ?? null,
      sha256: e.sha256 ?? null,
      path: e.kind === "directory" ? e.path : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return sha256Text(JSON.stringify(rows));
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function sha256File(filePath) {
  const st = statSync(filePath);
  if (!st.isFile()) {
    throw new Error(`sha256File expected a regular file: ${filePath}`);
  }
  return sha256Bytes(readFileSync(filePath));
}

export function normalizeSha256(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  return hex;
}

export function toSha256Prefixed(value) {
  const hex = normalizeSha256(value);
  return hex ? `sha256:${hex}` : null;
}

export function createDigestAdapter(injected = {}) {
  return {
    digestNamedBytes: injected.digestNamedBytes || digestNamedBytes,
    sha256Bytes: injected.sha256Bytes || sha256Bytes,
    sha256File: injected.sha256File || sha256File,
    normalizeSha256,
    toSha256Prefixed,
  };
}
