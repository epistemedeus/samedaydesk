import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVE_REL } from "./constants.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const TRIAL_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

export function repoRootFromHere(start) {
  return join(start, "../../..");
}

export function inRepoCheckout(root = REPO_ROOT) {
  return existsSync(join(root, "services/earned-work/src/obligation.ts"))
    && existsSync(join(root, ARCHIVE_REL));
}

export function defaultSubjectArchive(root = REPO_ROOT) {
  return join(root, ARCHIVE_REL);
}
