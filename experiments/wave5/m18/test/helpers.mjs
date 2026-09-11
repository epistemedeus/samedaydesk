import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_ROOT, SDS_ROOT } from "../lib/pins.mjs";
import { resolveEngine } from "../lib/resolve-engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const TRIAL_BIN = join(here, "../bin/trial.mjs");
export const ROOT = SDS_ROOT;
export const KIT = PACKAGE_ROOT;

export function engine() {
  return resolveEngine({ sdsRoot: SDS_ROOT, fetch: false });
}

export function tmpOut(prefix = "m18-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function spawnNode(script, args, { cwd = ROOT, env = {}, timeout = 20_000 } = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    timeout,
    env: { ...process.env, ...env },
  });
}

export function spawnTrial(args, extraEnv = {}) {
  const resolved = existsSync(process.env.PAGE_CHANGE_ENGINE_ROOT || "")
    ? process.env.PAGE_CHANGE_ENGINE_ROOT
    : engine().engineRoot;
  return spawnNode(TRIAL_BIN, args, {
    env: { PAGE_CHANGE_ENGINE_ROOT: resolved, ...extraEnv },
  });
}

export function stdoutJson(result) {
  const text = String(result.stdout || "").trim();
  if (!text) {
    throw new Error(`empty stdout status=${result.status} stderr=${result.stderr}`);
  }
  return JSON.parse(text);
}
