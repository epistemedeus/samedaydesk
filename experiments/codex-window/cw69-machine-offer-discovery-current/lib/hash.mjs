import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  const st = statSync(filePath);
  if (!st.isFile()) {
    throw new Error(`sha256File expected a regular file: ${filePath}`);
  }
  const buf = readFileSync(filePath);
  return { sha256: sha256Bytes(buf), bytes: buf.length };
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function hashPathTree(root) {
  const files = [];
  function walk(dir, rel) {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const childPath = join(dir, ent.name);
      if (ent.isDirectory()) walk(childPath, childRel);
      else if (ent.isFile()) {
        const hashed = sha256File(childPath);
        files.push({ path: childRel, sha256: hashed.sha256, bytes: hashed.bytes });
      }
    }
  }
  walk(root, "");
  const listing = files.map((row) => `${row.sha256}  ${row.bytes}  ${row.path}\n`).join("");
  return {
    sha256: sha256Text(listing),
    fileCount: files.length,
    bytes: files.reduce((sum, row) => sum + row.bytes, 0),
  };
}
