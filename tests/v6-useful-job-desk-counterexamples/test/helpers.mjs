import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BIN, FIXTURES, PACK_ROOT, REPO_ROOT } from "../lib/paths.mjs";

export { BIN, FIXTURES, PACK_ROOT, REPO_ROOT };

export function runCheck(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  return { text, json: text ? JSON.parse(text) : null };
}

export function readFixtureReport(rel) {
  return JSON.parse(readFileSync(join(FIXTURES, rel), "utf8"));
}

export function naiveAccept(report) {
  return report.ok === true || report.delivered === true || report.status === "delivered";
}
