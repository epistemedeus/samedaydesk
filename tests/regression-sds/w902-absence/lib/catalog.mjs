import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CORPUS_ROOT } from "./root.mjs";

export function loadManifest() {
  return JSON.parse(readFileSync(join(CORPUS_ROOT, "MANIFEST.json"), "utf8"));
}

export function loadFixture(rel) {
  const abs = resolve(CORPUS_ROOT, rel);
  const root = resolve(CORPUS_ROOT);
  if (abs !== root && !abs.startsWith(`${root}/`)) {
    const err = new Error(`fixture path escapes corpus: ${rel}`);
    err.code = "FIXTURE_ESCAPE";
    throw err;
  }
  const raw = JSON.parse(readFileSync(abs, "utf8"));
  return { abs, rel, raw };
}

export function listCaseFiles() {
  const dir = join(CORPUS_ROOT, "fixtures/cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join("fixtures/cases", name));
}
