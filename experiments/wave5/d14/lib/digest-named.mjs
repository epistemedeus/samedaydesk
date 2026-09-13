import { createHash } from "node:crypto";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

/** Same projection as server digestNamedBytes: name, kind, bytes, sha256; directory path only. */
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

export function sortValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortValue(value[k])]));
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function resultIdentityPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { retrieval, cache, ...rest } = body;
  void retrieval;
  void cache;
  return sortValue(rest);
}

export function resultIdentityHash(body) {
  const payload = resultIdentityPayload(body);
  if (!payload) return null;
  return sha256Text(JSON.stringify(payload));
}

export function projectNamedMeta(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    name: entry.name,
    kind: entry.kind || "file",
    bytes: entry.bytes ?? null,
    sha256: entry.sha256 ?? null,
    path: entry.kind === "directory" ? entry.path : undefined,
  };
}
