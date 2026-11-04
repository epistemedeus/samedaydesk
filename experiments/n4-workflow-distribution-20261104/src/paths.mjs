import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));

export const experimentRoot = dirname(srcDir);
export const repoRoot = dirname(dirname(experimentRoot));

export const pinsPath = join(experimentRoot, "PINS.json");
export const workflowBin = join(experimentRoot, "bin", "workflow.mjs");
export const tableCheck = join(experimentRoot, "src", "table_check.py");
export const difyDir = join(experimentRoot, "assets", "dify");
export const ghostSync = join(experimentRoot, "assets", "ghost", "sync.mjs");
export const ghostDestination = join(experimentRoot, "assets", "ghost", "destination.mjs");

export function repoPath(relative) {
  return join(repoRoot, relative);
}
