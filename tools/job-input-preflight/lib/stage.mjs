import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STAGED_DIR_NAME } from "./constants.mjs";

export function ensureStagedDir(outDir) {
  if (outDir) {
    const resolved = path.resolve(String(outDir));
    const stagedDir = path.join(resolved, STAGED_DIR_NAME);
    fs.mkdirSync(stagedDir, { recursive: true });
    return { outDir: resolved, stagedDir, persist: true };
  }
  const stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), "jip-staged-"));
  return { outDir: null, stagedDir, persist: false };
}

export function writeStagedBytes(stagedDir, item) {
  const name = item.inline ? `${item.key}.json` : `${item.key}${path.extname(item.path || "") || ".json"}`;
  const stagedPath = path.join(stagedDir, name);
  fs.writeFileSync(stagedPath, item.buffer);
  return stagedPath;
}

/**
 * Copy SAMPLE sibling markers next to staged files so D01 inspectSample still
 * sees provenance after the engine is fed staged paths rather than originals.
 */
export function copySiblingSampleMarkers(sourcePath, stagedDir) {
  if (!sourcePath) return [];
  const dir = path.dirname(sourcePath);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const copied = [];
  for (const name of names) {
    if (!/^SAMPLE(\.|$)/i.test(name) && !/\.SAMPLE\./i.test(name)) continue;
    const from = path.join(dir, name);
    const to = path.join(stagedDir, name);
    try {
      if (!fs.statSync(from).isFile()) continue;
      fs.copyFileSync(from, to);
      copied.push(to);
    } catch {
      /* skip unreadable markers */
    }
  }
  return copied;
}
