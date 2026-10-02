import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_CITES } from "./catalog.mjs";
import { hashFile } from "./load-engine.mjs";

export function citePublishedEngine(repoRoot) {
  const files = [];
  const missing = [];
  for (const cite of ENGINE_CITES) {
    const abs = join(repoRoot, cite.path);
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch (err) {
      missing.push({ path: cite.path, error: err.message });
      continue;
    }
    const absent = cite.patterns.filter((pattern) => !source.includes(pattern));
    files.push({
      path: cite.path,
      sha256: hashFile(abs),
      bytes: Buffer.byteLength(source),
      note: cite.note,
      patterns: cite.patterns,
      missingPatterns: absent,
      ok: absent.length === 0,
    });
  }
  return {
    ok: missing.length === 0 && files.every((f) => f.ok),
    files,
    missing,
  };
}
