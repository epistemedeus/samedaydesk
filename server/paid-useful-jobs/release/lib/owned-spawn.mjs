/**
 * Spawn a child in its own process group and reap that group on
 * timeout, SIGTERM, SIGINT, or SIGHUP. Never kill unrelated PIDs.
 */
import { spawn } from "node:child_process";

export const DEFAULT_OWNED_TIMEOUT_MS = 120_000;

function killGroup(pid, signal = "SIGTERM") {
  if (!Number.isInteger(pid) || pid <= 1) return;
  try {
    process.kill(-pid, signal);
  } catch {
    /* group already gone */
  }
  try {
    process.kill(pid, signal);
  } catch {
    /* leader already gone */
  }
}

export function spawnOwned(command, args, {
  cwd = undefined,
  env = process.env,
  timeoutMs = DEFAULT_OWNED_TIMEOUT_MS,
  encoding = "utf8",
  maxBuffer = 8 * 1024 * 1024,
} = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const gid = child.pid;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timer = null;

    const finish = (status, signal, error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      process.removeListener("SIGTERM", onParentSignal);
      process.removeListener("SIGINT", onParentSignal);
      process.removeListener("SIGHUP", onParentSignal);
      resolve({
        status,
        signal: signal || null,
        stdout,
        stderr,
        pid: gid,
        timedOut,
        error,
      });
    };

    const onParentSignal = () => {
      timedOut = false;
      killGroup(gid, "SIGKILL");
      finish(null, "SIGKILL", { code: "SIGTERM" });
      process.exitCode = 1;
    };

    process.on("SIGTERM", onParentSignal);
    process.on("SIGINT", onParentSignal);
    process.on("SIGHUP", onParentSignal);

    child.stdout.setEncoding(encoding);
    child.stderr.setEncoding(encoding);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, encoding) > maxBuffer) {
        killGroup(gid, "SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      finish(null, null, err);
    });
    child.on("close", (status, signal) => {
      finish(status, signal, timedOut ? { code: "ETIMEDOUT" } : null);
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killGroup(gid, "SIGTERM");
        setTimeout(() => killGroup(gid, "SIGKILL"), 200).unref?.();
      }, timeoutMs);
    }
  });
}
