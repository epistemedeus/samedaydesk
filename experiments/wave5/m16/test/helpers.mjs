import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED = join(here, "..");
export const BIN = join(OWNED, "bin/trial.mjs");
export const FX = (...p) => join(OWNED, "fixtures", ...p);

export function tmpOut() {
  return mkdtempSync(join(tmpdir(), "w5-m16-out-"));
}

export function runCli(argv, { expectStatus = 0, timeout = 60_000 } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...argv], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  let json = null;
  const stdout = String(r.stdout || "").trim();
  if (stdout) {
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
  }
  if (r.status !== expectStatus) {
    throw new Error(
      `cli ${argv.join(" ")}\nstatus ${r.status} expected ${expectStatus}\nstdout=${r.stdout}\nstderr=${r.stderr}`,
    );
  }
  return { ...r, json };
}

export function spawnCliAsync(argv, { timeout = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...argv], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout: ${argv.join(" ")}`));
    }, timeout);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(t);
      let json = null;
      try {
        json = JSON.parse(stdout.trim());
      } catch {
        json = null;
      }
      resolve({ status, stdout, stderr, json });
    });
  });
}
