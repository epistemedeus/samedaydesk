import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");

function gitTopLevel(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`cannot resolve git toplevel from ${dir}: ${r.stderr || r.stdout}`);
  }
  return String(r.stdout).trim();
}

export const REPO_ROOT = gitTopLevel(OWNED_DIR);
export const PIN = JSON.parse(readFileSync(join(OWNED_DIR, "PIN.json"), "utf8"));

export const TRIAL_SCHEMA = "samedaydesk.wave5.m16.dependency-update-trial.v1";
export const ENGINE_REPORT_SCHEMA = "samedaydesk.lockfile-pin-delta.v1";
export const ENGINE_SHA = PIN.engine.sha;
export const ENGINE_PATH = PIN.engine.path;
export const ENGINE_CLI = PIN.engine.cli;
export const WRAPPER_SHA = PIN.wrapper.sha;
export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const DEFAULT_JOURNEY = "sds-vuln-update";
