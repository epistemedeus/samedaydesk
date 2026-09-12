import { copyFileSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CALLER_BUDGET_AFTER,
  CALLER_BUDGET_BEFORE,
  CALLER_REPEAT_INPUT_ROOT,
  CALLER_REPEAT_NEXT_ROOT,
} from "../lib/paths.mjs";

export function stageVendorBudget() {
  const work = mkdtempSync(join(tmpdir(), "d15-stage-"));
  const before = join(work, "before.json");
  const after = join(work, "after.json");
  copyFileSync(CALLER_BUDGET_BEFORE, before);
  copyFileSync(CALLER_BUDGET_AFTER, after);
  return { work, before, after };
}

export function stageNoChangeBudget() {
  const staged = stageVendorBudget();
  copyFileSync(staged.before, staged.after);
  return staged;
}

export function stageRepeatRoot() {
  const work = mkdtempSync(join(tmpdir(), "d15-repeat-"));
  const inputRoot = join(work, "input-root");
  mkdirSync(inputRoot, { recursive: true });
  cpSync(CALLER_REPEAT_INPUT_ROOT, inputRoot, { recursive: true });
  const nextRun = join(work, "next-run.json");
  copyFileSync(CALLER_REPEAT_NEXT_ROOT, nextRun);
  return { work, inputRoot, nextRun };
}

export function writeSibling(work, name, text) {
  const path = join(work, name);
  writeFileSync(path, text);
  return path;
}
