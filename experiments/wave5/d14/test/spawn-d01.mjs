import { existsSync, mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { D01_PIN, REPO_ROOT } from "../lib/pins.mjs";

const SERVE_REL = "server/paid-useful-jobs/bin/serve-execution.mjs";

function servePath(root) {
  return join(root, SERVE_REL);
}

export function resolveD01Root() {
  const envRoot = process.env.W5_D01_ROOT;
  if (envRoot && existsSync(servePath(envRoot))) return envRoot;
  if (existsSync(servePath(REPO_ROOT))) return REPO_ROOT;

  const cached = process.env.W5_D01_WORKTREE || "/tmp/ro-worktrees/w5-d01";
  if (existsSync(servePath(cached))) return cached;

  mkdirSync(dirname(cached), { recursive: true });
  const fetch = spawnSync("git", ["fetch", "--", "origin", D01_PIN], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (fetch.status !== 0) {
    throw new Error(`git fetch D01 pin ${D01_PIN} failed: ${fetch.stderr || fetch.stdout}`);
  }
  if (!existsSync(cached)) {
    const add = spawnSync("git", ["worktree", "add", "--detach", cached, D01_PIN], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (add.status !== 0 && !existsSync(servePath(cached))) {
      throw new Error(`git worktree add D01 failed: ${add.stderr || add.stdout}`);
    }
  }
  if (!existsSync(servePath(cached))) {
    throw new Error(`D01 serve-execution.mjs missing at ${cached} after fetch. Incomplete, not skipped.`);
  }
  return cached;
}

export function spawnD01Http() {
  const root = resolveD01Root();
  const serve = servePath(root);
  const child = spawn(process.execPath, [serve], {
    cwd: root,
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const originPromise = new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("D01 serve-execution produced no origin")), 20_000);
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        clearTimeout(timer);
        try {
          const line = JSON.parse(buf.slice(0, nl));
          if (!line.origin) reject(new Error("D01 serve-execution origin missing"));
          else resolve(line.origin);
        } catch (err) {
          reject(err);
        }
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code) reject(new Error(`D01 serve-execution exited ${code} signal=${signal}`));
    });
  });
  return {
    root,
    pin: D01_PIN,
    child,
    originPromise,
    stop() {
      if (child.killed) return;
      child.kill("SIGTERM");
    },
  };
}
