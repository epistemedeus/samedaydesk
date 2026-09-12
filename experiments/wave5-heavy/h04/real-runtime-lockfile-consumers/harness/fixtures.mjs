import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT } from "./paths.mjs";

export function loadLockfiles() {
  const before = JSON.parse(readFileSync(join(PACKAGE_ROOT, "fixtures/before.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(PACKAGE_ROOT, "fixtures/after.json"), "utf8"));
  const unchanged = JSON.parse(readFileSync(join(PACKAGE_ROOT, "fixtures/after-unchanged.json"), "utf8"));
  return {
    before,
    after,
    unchanged,
    changeBody: JSON.stringify({ before, after }),
    noChangeBody: JSON.stringify({ before, after: unchanged }),
  };
}
