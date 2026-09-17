import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

export function sha256Tree(root) {
  if (!statSync(root).isDirectory()) {
    throw Object.assign(new Error(`not a directory: ${root}`), { code: "not-a-directory" });
  }
  const files = [];
  function walk(dir, rel = "") {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const nextRel = rel ? `${rel}/${name}` : name;
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs, nextRel);
      else if (st.isFile()) files.push(nextRel);
    }
  }
  walk(root);
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel);
    h.update("\0");
    h.update(readFileSync(join(root, rel)));
    h.update("\0");
  }
  return { sha256: h.digest("hex"), fileCount: files.length, files };
}

export function fileRecord(filePath, { packRoot } = {}) {
  const buf = readFileSync(filePath);
  return {
    path: packRoot && filePath.startsWith(packRoot) ? filePath.slice(packRoot.length + 1) : filePath,
    abs: filePath,
    bytes: buf.length,
    sha256: sha256Buffer(buf),
  };
}

const VOLATILE_OUTPUT_KEYS = new Set(["generatedAt", "outDir", "caller", "digest"]);

export function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_OUTPUT_KEYS.has(key)) continue;
      out[key] = stripVolatile(value[key]);
    }
    return out;
  }
  return value;
}

export function fileFingerprint(filePath) {
  const buf = readFileSync(filePath);
  if (filePath.endsWith(".json")) {
    try {
      return sha256Buffer(Buffer.from(`${JSON.stringify(stripVolatile(JSON.parse(buf.toString("utf8"))))}\n`));
    } catch {
      return sha256Buffer(buf);
    }
  }
  return sha256Buffer(buf);
}

export function outputFingerprint(outDir, names) {
  const list = [...(names || [])].sort();
  if (!outDir || list.length === 0) return null;
  const h = createHash("sha256");
  for (const name of list) {
    const abs = join(outDir, name);
    h.update(name);
    h.update("\0");
    h.update(fileFingerprint(abs));
    h.update("\0");
  }
  return h.digest("hex");
}
