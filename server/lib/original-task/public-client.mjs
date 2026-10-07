// Deterministic public archive of the original-task client.
// Members are the static import closure of cli.mjs plus the bundled descriptor.
// Operator, database, and server modules are refused.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const IMPORT_RE = /(?:from|import)\s*(?:\(\s*)?['"]([^'"]+)['"]/g;
export const DISCOVERY_REL = "client/public/discovery/original-task-correspondence.json";
export const BUNDLED_REL = "server/lib/original-task/bundled-descriptor.json";
export const ARCHIVE_REL = "client/public/for-agents/original-task/original-task-client.tar.gz";
const ENTRY = "server/lib/original-task/cli.mjs";

const FORBIDDEN = [
  "collect.mjs",
  "operator-http.mjs",
  "event-guard.mjs",
  "deps.mjs",
  "store.mjs",
  "mount.mjs",
  ".sql",
  "node_modules",
  ".env",
];

function posix(path) {
  return path.split("\\").join("/");
}

export function closureFiles(root = ROOT) {
  const seen = new Set();
  const queue = [ENTRY];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const text = readFileSync(join(root, rel), "utf8");
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (!spec.startsWith(".")) continue;
      const next = posix(relative(root, join(dirname(join(root, rel)), spec)));
      queue.push(next);
    }
  }
  seen.add(BUNDLED_REL);
  return [...seen].sort();
}

function assertPublic(rel) {
  if (FORBIDDEN.some((token) => rel === token || rel.endsWith(`/${token}`) || rel.endsWith(token))) {
    throw new Error(`public client refused ${rel}`);
  }
  if (rel.length > 100) throw new Error(`archive name too long ${rel}`);
}

export function bundledDescriptor(discovery) {
  const body = structuredClone(discovery);
  delete body.acquisition.archive.sha256;
  delete body.acquisition.archive.bytes;
  return body;
}

function octalField(buf, offset, value, length) {
  const text = value.toString(8).padStart(length - 1, "0");
  buf.write(text, offset, length - 1, "ascii");
  buf[offset + length - 1] = 0;
}

function header(name, size) {
  const buf = Buffer.alloc(512);
  buf.write(name, 0, "ascii");
  octalField(buf, 100, 0o644, 8);
  octalField(buf, 108, 0, 8);
  octalField(buf, 116, 0, 8);
  octalField(buf, 124, size, 12);
  octalField(buf, 136, 0, 12);
  buf.fill(0x20, 148, 156);
  buf[156] = 0x30;
  buf.write("ustar\0", 257, "ascii");
  buf.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of buf) sum += byte;
  const checksum = sum.toString(8).padStart(6, "0");
  buf.write(checksum, 148, "ascii");
  buf[154] = 0;
  buf[155] = 0x20;
  return buf;
}

export function packArchive(files) {
  const parts = [];
  for (const [name, bytes] of [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    assertPublic(name);
    parts.push(header(name, bytes.length), bytes);
    const pad = (512 - (bytes.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  const gz = gzipSync(Buffer.concat(parts), { level: 9 });
  gz.writeUInt32LE(0, 4);
  return gz;
}

export function buildPublicClient(root = ROOT) {
  const discovery = JSON.parse(readFileSync(join(root, DISCOVERY_REL), "utf8"));
  const bundled = bundledDescriptor(discovery);
  const bundledBytes = Buffer.from(`${JSON.stringify(bundled, null, 2)}\n`);
  const files = new Map();
  for (const rel of closureFiles(root)) {
    assertPublic(rel);
    files.set(rel, rel === BUNDLED_REL ? bundledBytes : readFileSync(join(root, rel)));
  }
  const archive = packArchive(files);
  const sha256 = createHash("sha256").update(archive).digest("hex");
  const published = structuredClone(discovery);
  published.acquisition.archive.sha256 = sha256;
  published.acquisition.archive.bytes = archive.length;
  return { files: [...files.keys()].sort(), bundled, bundledBytes, archive, sha256, bytes: archive.length, published };
}

export function acceptPublicArchive(bytes, descriptor) {
  const expected = descriptor?.acquisition?.archive;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!expected || typeof expected.sha256 !== "string" || expected.sha256.length !== 64 ||
      bytes.length !== expected.bytes || sha256 !== expected.sha256) {
    throw Object.assign(new Error("archive_refused"), { code: "archive_refused" });
  }
  return sha256;
}

export function writePublicClient(root = ROOT) {
  const built = buildPublicClient(root);
  const archivePath = join(root, ARCHIVE_REL);
  mkdirSync(dirname(archivePath), { recursive: true });
  mkdirSync(dirname(join(root, BUNDLED_REL)), { recursive: true });
  writeFileSync(join(root, BUNDLED_REL), built.bundledBytes);
  writeFileSync(archivePath, built.archive);
  writeFileSync(join(root, DISCOVERY_REL), `${JSON.stringify(built.published, null, 2)}\n`);
  return { sha256: built.sha256, bytes: built.bytes, files: built.files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(writePublicClient()));
}
