import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { OWNED_DIR, REPO_ROOT } from "../lib/pins.mjs";
import { defaultWrapperRoot } from "../lib/wrapper-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CLI = join(here, "../bin/orders.mjs");
export const FIXTURES = join(here, "../fixtures");
export const ORDERS = join(FIXTURES, "orders");
export const WRAPPER_ROOT = defaultWrapperRoot();

export function tmpStore() {
  return mkdtempSync(join(tmpdir(), "managed-order-store-"));
}

export function tmpOut() {
  return mkdtempSync(join(tmpdir(), "managed-order-out-"));
}

export function loadOrder(name) {
  return JSON.parse(readFileSync(join(ORDERS, name), "utf8"));
}

export function cliArgs(args, { store, outDir, wrapperRoot = WRAPPER_ROOT, executeUrl = null } = {}) {
  const argv = [...args];
  if (store) argv.push("--store", store);
  if (outDir) argv.push("--out-dir", outDir);
  if (wrapperRoot) argv.push("--wrapper-root", wrapperRoot);
  if (executeUrl) argv.push("--execute-url", executeUrl);
  return argv;
}

export function runCli(args, opts = {}) {
  const { cwd = REPO_ROOT, timeout = 120_000 } = opts;
  return spawnSync(process.execPath, [CLI, ...cliArgs(args, opts)], {
    encoding: "utf8",
    cwd,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function spawnCli(args, opts = {}) {
  const { cwd = REPO_ROOT, timeout = 180_000 } = opts;
  const child = spawn(process.execPath, [CLI, ...cliArgs(args, opts)], { cwd });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, timeout);
  const done = new Promise((resolve) => {
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, pid: child.pid });
    });
  });
  return { child, done };
}

export function parseStdout(proc) {
  const text = String(proc.stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`CLI stdout was not JSON: ${text.slice(0, 800)}\nstderr=${proc.stderr}`);
  }
}

export { OWNED_DIR, REPO_ROOT };
