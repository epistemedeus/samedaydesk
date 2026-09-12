import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = fileURLToPath(new URL("..", import.meta.url));

export function loadCases() {
  return JSON.parse(readFileSync(join(PKG_ROOT, "cases.json"), "utf8"));
}

export function fixturePath(rel) {
  return join(PKG_ROOT, rel);
}
