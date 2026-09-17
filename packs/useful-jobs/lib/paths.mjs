import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = resolve(HERE, "..");
export const SKILL_PATH = join(PACK_ROOT, "SKILL.md");
export const PIN_PATH = join(PACK_ROOT, "PIN.json");
export const MANIFEST_PATH = join(PACK_ROOT, "MANIFEST.json");
export const SEEDED_RUN_SKILL = join(PACK_ROOT, "fixtures/seeded/skill-advertises-run.md");

export const PIN = JSON.parse(readFileSync(PIN_PATH, "utf8"));
export const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

export const SCHEMA = "samedaydesk.useful-jobs.skill-list-help.v1";

export function findRepoRoot({ repoRoot } = {}) {
  if (repoRoot) return resolve(repoRoot);
  let dir = PACK_ROOT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "client/public/for-agents/useful-jobs"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(PACK_ROOT, "../..");
}
