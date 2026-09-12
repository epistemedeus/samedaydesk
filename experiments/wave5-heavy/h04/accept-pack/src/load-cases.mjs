import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(here, "..");
export const CASES_ROOT = join(PACK_ROOT, "cases");
export const H04_ROOT = join(PACK_ROOT, "..");

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of ents) {
    const path = join(dir, ent.name);
    if (ent.isDirectory()) walk(path, acc);
    else if (ent.isFile() && (ent.name === "case.json" || ent.name === "example.json")) acc.push(path);
  }
  return acc;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Load accept-pack cases plus the preserved seven public lockfile examples.
 */
export function loadAcceptCases() {
  const cases = [];
  const errors = [];

  for (const file of walk(CASES_ROOT).sort()) {
    try {
      const data = readJson(file);
      const dir = dirname(file);
      const id = data.id || dirname(file).split("/").pop();
      cases.push({
        ...data,
        id,
        dir,
        casePath: file,
        pack: "accept-pack",
      });
    } catch (err) {
      errors.push({ path: file, error: err.message });
    }
  }

  const lockPublic = join(H04_ROOT, "examples", "lockfile-public");
  for (const file of walk(lockPublic).sort()) {
    if (!file.endsWith("example.json")) continue;
    try {
      const data = readJson(file);
      cases.push({
        ...data,
        id: data.id,
        dir: dirname(file),
        casePath: file,
        pack: "lockfile-public",
        engineId: data.m01EngineId || "lockfile-pin-delta",
      });
    } catch (err) {
      errors.push({ path: file, error: err.message });
    }
  }

  return { cases, errors };
}
