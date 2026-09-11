import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { OWNED_DIR, REPO_ROOT } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CLI = join(here, "../bin/orders.mjs");
export const FIXTURES = join(here, "../fixtures");
export const ORDERS = join(FIXTURES, "orders");

export function tmpStore() {
  return mkdtempSync(join(tmpdir(), "managed-order-store-"));
}

export function tmpOut() {
  return mkdtempSync(join(tmpdir(), "managed-order-out-"));
}

export function loadOrder(name) {
  return JSON.parse(readFileSync(join(ORDERS, name), "utf8"));
}

export function runCli(args, { store, outDir, cwd = REPO_ROOT, timeout = 120_000 } = {}) {
  const argv = [CLI, ...args];
  if (store) argv.push("--store", store);
  if (outDir) argv.push("--out-dir", outDir);
  return spawnSync(process.execPath, argv, {
    encoding: "utf8",
    cwd,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
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
