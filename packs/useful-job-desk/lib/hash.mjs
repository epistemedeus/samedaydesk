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
