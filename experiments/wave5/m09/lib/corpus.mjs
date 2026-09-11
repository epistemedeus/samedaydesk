import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES_ROOT } from "./paths.mjs";

export function listCaseIds(root = CASES_ROOT) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadCase(id, root = CASES_ROOT) {
  const dir = join(root, id);
  const metaPath = join(dir, "case.json");
  const beforePath = join(dir, "before.json");
  const afterPath = join(dir, "after.json");
  if (!existsSync(metaPath) || !existsSync(beforePath) || !existsSync(afterPath)) {
    const error = new Error(`incomplete snapshot case ${id}`);
    error.code = "case_missing";
    throw error;
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  return {
    ...meta,
    dir,
    beforePath,
    afterPath,
    before: JSON.parse(readFileSync(beforePath, "utf8")),
    after: JSON.parse(readFileSync(afterPath, "utf8")),
  };
}

export function loadCorpus(root = CASES_ROOT) {
  return listCaseIds(root).map((id) => loadCase(id, root));
}
