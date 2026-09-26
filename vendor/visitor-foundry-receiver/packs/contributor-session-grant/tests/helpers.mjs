import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = dirname(TESTS_DIR);
export const CLI = join(PACK_ROOT, "bin", "contributor-session-grant.mjs");

export function tempDir(prefix = "csg-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeOwnerTokenFile(dir, token = "dev-owner-token-s275") {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "owner.token");
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  return path;
}

export function runCli(args, { env, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
    child.on("close", (code) => {
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = null;
      }
      resolve({ code, stdout, stderr, json });
    });
  });
}

export function envWithoutOwner(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.EARNED_WORK_OWNER_TOKEN;
  delete env.WALLETLESS_LEDGER_ADMIN_TOKEN;
  return env;
}
