import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMITTED } from "./constants.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(here, "..");
export const FIXTURE_ROOT = join(PACK_ROOT, "fixtures");
export const VALID_FIXTURES = join(FIXTURE_ROOT, "valid");
export const REJECT_FIXTURES = join(FIXTURE_ROOT, "reject");
export const DEFAULT_CATALOG = join(FIXTURE_ROOT, "catalog.json");
export const DEFAULT_SCHEMA = join(PACK_ROOT, "schema", "receipt-claim.v1.json");
export const REJECT_MANIFEST = join(REJECT_FIXTURES, "manifest.json");

export function findRepoRoot(start = PACK_ROOT) {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, COMMITTED.x402Catalog)) && existsSync(join(dir, COMMITTED.settlement))) {
      return dir;
    }
    dir = join(dir, "..");
  }
  throw new Error("cannot locate SDS repo root from packs/verifiers/w903-receipt-forge");
}

export function committedPath(rel, repoRoot = findRepoRoot()) {
  return join(repoRoot, rel);
}
