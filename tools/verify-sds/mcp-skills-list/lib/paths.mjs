import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_DIR = join(LIB_DIR, "..");
export const REPO_ROOT = join(PACKAGE_DIR, "../../..");
export const FIXTURES_DIR = join(PACKAGE_DIR, "fixtures");
export const SKILLS_DIR = join(FIXTURES_DIR, "skills");

export function skillMdPath(name) {
  return join(SKILLS_DIR, name, "SKILL.md");
}
