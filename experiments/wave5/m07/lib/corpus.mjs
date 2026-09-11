import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = fileURLToPath(new URL("..", import.meta.url));

export function pkgRoot() {
  return PKG;
}

export function loadCorpus() {
  return JSON.parse(readFileSync(join(PKG, "corpus/cases.json"), "utf8"));
}

export function fixturePath(rel) {
  return join(PKG, rel);
}
