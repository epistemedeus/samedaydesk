import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNTIME_AFTER, RUNTIME_BEFORE } from "../lib/paths.mjs";

export function stageRuntimeOwned() {
  const work = mkdtempSync(join(tmpdir(), "d27-stage-"));
  const before = join(work, "before.json");
  const after = join(work, "after.json");
  copyFileSync(RUNTIME_BEFORE, before);
  copyFileSync(RUNTIME_AFTER, after);
  return { work, before, after };
}

export function writeTemp(work, name, text) {
  const path = join(work, name);
  writeFileSync(path, text);
  return path;
}
