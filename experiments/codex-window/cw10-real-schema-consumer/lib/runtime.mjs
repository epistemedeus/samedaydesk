import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
export const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const hashFile = (file) => sha256(fs.readFileSync(file));

// Each child has an owned process group. Timeouts and normal completion reap
// descendants in that group, never another writer's processes.
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 120_000,
    ...options,
    detached: true,
    env: { ...process.env, ...options.env, NODE_OPTIONS: "--max-old-space-size=768", TAR_OPTIONS: "--no-same-owner" },
  });
  if (result.pid) {
    try { process.kill(-result.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  if (result.error) throw result.error;
  return result;
}

export function requireSuccess(result, context) {
  if (result.status !== 0) throw new Error(`${context} exited ${result.status}: ${(result.stderr || result.stdout).slice(0, 1600)}`);
  return result;
}

export function parseOptions(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const match = /^(--[a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match || !allowed.includes(match[1].slice(2))) throw new Error(`Unknown argument: ${argv[i]}`);
    const key = match[1].slice(2);
    if (Object.hasOwn(out, key)) throw new Error(`Duplicate option: --${key}`);
    const value = match[2] ?? argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value: --${key}`);
    out[key] = value;
  }
  return out;
}
