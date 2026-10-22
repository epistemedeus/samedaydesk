import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

export function fileArtifact(name, filePath) {
  const buf = readFileSync(filePath);
  return {
    name,
    bytes: buf.length,
    sha256: sha256Bytes(buf),
  };
}

export function statBytes(filePath) {
  return statSync(filePath).size;
}

export function artifactsDigest(artifacts) {
  const rows = [...artifacts]
    .map((a) => ({ name: a.name, bytes: a.bytes, sha256: a.sha256 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return sha256Bytes(Buffer.from(JSON.stringify(rows), "utf8"));
}
