import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = join(TEST_DIR, "..");
export const REPO = join(TOOL_DIR, "../..");
export const CLI = join(TOOL_DIR, "bin/managed-listing-repair.mjs");
export const OK_FIXTURE = join(TOOL_DIR, "fixtures/ok.json");

export function tmpOut(name = "journey.json") {
  const dir = mkdtempSync(join(tmpdir(), "mlr-test-"));
  return join(dir, name);
}

export function runCli(args, { cwd = REPO } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function changedPathsVsMain() {
  const cmds = [
    ["diff", "--name-only", "origin/main"],
    ["diff", "--cached", "--name-only", "origin/main"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  const names = new Set();
  for (const args of cmds) {
    const result = spawnSync("git", args, { encoding: "utf8", cwd: REPO });
    for (const line of String(result.stdout || "").split("\n")) {
      const name = line.trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

export function namedToolPrice(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`name:\\s*"${escaped}"[\\s\\S]{0,120}?price:\\s*"(\\$[^"]+)"`);
  const match = String(source).match(re);
  return match ? match[1] : null;
}
