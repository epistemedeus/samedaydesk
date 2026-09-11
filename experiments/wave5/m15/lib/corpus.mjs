import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT_ROOT } from "./pins.mjs";

const CORPUS_ROOT = join(KIT_ROOT, "fixtures", "corpus");

export function corpusRoot() {
  return CORPUS_ROOT;
}

export function listCorpusCases(root = CORPUS_ROOT) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(root, entry.name);
      const metaPath = join(dir, "CASE.json");
      const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : { id: entry.name };
      return {
        id: meta.id || entry.name,
        dir,
        meta,
        files: {
          before: join(dir, "before.json"),
          after: join(dir, "after.json"),
          used: join(dir, "used.json"),
        },
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function loadSiblingM06Corpus(searchRoot = join(KIT_ROOT, "..", "m06")) {
  if (!existsSync(searchRoot)) {
    return { status: "not-exported", root: searchRoot, cases: [] };
  }
  return { status: "present", root: searchRoot, cases: listCorpusCases(searchRoot) };
}
