import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT, RUNTIME_PIN, SERVE_EXECUTION_REL } from "../lib/pins.mjs";

function servePath(root) {
  return join(root, SERVE_EXECUTION_REL);
}

export function resolveD01Root() {
  const envRoot = process.env.W5_D01_ROOT;
  if (envRoot && existsSync(servePath(envRoot))) return envRoot;
  if (existsSync(servePath(REPO_ROOT))) return REPO_ROOT;
  throw new Error(
    `in-tree ${SERVE_EXECUTION_REL} missing at ${REPO_ROOT}. git-fetch of historical D01 pins is forbidden.`,
  );
}

export function resolveServeRoot() {
  return resolveD01Root();
}

export function spawnExecutionHttp({ tmpDir } = {}) {
  const root = resolveServeRoot();
  const serve = servePath(root);
  const serverTmp = tmpDir || join(process.env.TMPDIR || tmpdir(), `serve-execution-${process.pid}-${Date.now()}`);
  mkdirSync(serverTmp, { recursive: true });
  const child = spawn(process.execPath, [serve], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      TMPDIR: serverTmp,
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=768",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const originPromise = new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => {
      reject(new Error(`serve-execution produced no origin: ${stderr.slice(0, 800)}`));
    }, 20_000);
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        clearTimeout(timer);
        try {
          const line = JSON.parse(buf.slice(0, nl));
          if (!line.origin) reject(new Error("serve-execution origin missing"));
          else resolve(line.origin);
        } catch (err) {
          reject(err);
        }
      }
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code) reject(new Error(`serve-execution exited ${code} signal=${signal}: ${stderr.slice(0, 800)}`));
    });
  });
  return {
    root,
    pin: RUNTIME_PIN,
    child,
    tmpdir: serverTmp,
    originPromise,
    stderr: () => stderr,
    stop() {
      if (child.killed || child.exitCode != null) return;
      child.kill("SIGTERM");
    },
  };
}

/** @deprecated historical name; launches in-tree serve-execution.mjs only. */
export function spawnD01Http(opts) {
  return spawnExecutionHttp(opts);
}
