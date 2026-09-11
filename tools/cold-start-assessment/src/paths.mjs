import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = join(here, "..");
export const BIN_PATH = join(PACKAGE_ROOT, "bin/assess.mjs");
export const REPO_ROOT = join(PACKAGE_ROOT, "../..");
export const FIXTURES_ROOT = join(PACKAGE_ROOT, "fixtures");
