import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(here, "../../..");
export const BIN = join(PACK_ROOT, "bin/run.mjs");
export const FIXTURES = join(PACK_ROOT, "fixtures");

export function runCli(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  return { text, json: text ? JSON.parse(text) : null };
}

export function naiveRepeatDemand(pair) {
  const ranTwice = Array.isArray(pair?.runs) && pair.runs.length === 2;
  if (ranTwice && pair.demandClass === "repeat_demand") {
    return { ok: true, repeatDemand: true };
  }
  return { ok: false, repeatDemand: false };
}
