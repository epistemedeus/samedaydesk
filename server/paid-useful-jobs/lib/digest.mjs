import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  const st = statSync(filePath);
  if (!st.isFile()) {
    throw new Error(`sha256File expected a regular file: ${filePath}`);
  }
  return sha256Bytes(readFileSync(filePath));
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

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

export function fileEntry(name, filePath) {
  const buf = readFileSync(filePath);
  return {
    name,
    path: filePath,
    bytes: buf.length,
    sha256: sha256Bytes(buf),
  };
}

export function statBytes(filePath) {
  return statSync(filePath).size;
}
