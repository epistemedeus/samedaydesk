import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT_ROOT } from "./pins.mjs";

const PAIRS_ROOT = join(KIT_ROOT, "fixtures", "real-pairs");

export const PAIR_IDS = Object.freeze(["schemastore-package-sideEffects", "sds-verified-feed"]);

export function loadPair(id) {
  const dir = join(PAIRS_ROOT, id);
  const sourcePath = join(dir, "SOURCE.json");
  if (!existsSync(sourcePath)) {
    throw new Error(`unknown pair ${id}`);
  }
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const files = {
    before: join(dir, "before.json"),
    after: join(dir, "after.json"),
    used: join(dir, "used.json"),
  };
  for (const [key, path] of Object.entries(files)) {
    if (!existsSync(path)) throw new Error(`pair ${id} missing ${key} at ${path}`);
  }
  return { id, dir, source, files };
}

export function listPairs() {
  return PAIR_IDS.map((id) => loadPair(id));
}
