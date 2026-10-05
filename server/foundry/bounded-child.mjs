import { spawn } from "node:child_process";

const active = new Set();
let interrupted = false;
function interrupt() { interrupted = true; for (const stop of active) stop("interrupted"); }
function enroll(stop) {
  if (active.size === 0) { process.on("SIGTERM", interrupt); process.on("SIGINT", interrupt); process.on("exit", interrupt); }
  active.add(stop);
}
function release(stop) {
  active.delete(stop);
  if (active.size === 0) { process.off("SIGTERM", interrupt); process.off("SIGINT", interrupt); process.off("exit", interrupt); }
}

// Installed diagnostics/setup only. Never accept commands from visitor data.
// Own the process group, drain both pipes, retain bounded stdout, expose no stderr.
export function runBounded(command, args, {
  cwd, env = { PATH: process.env.PATH || "", LANG: "C", LC_ALL: "C" },
  input = null, timeoutMs = 30_000, stdoutLimit = 8192,
  outputLimit = 128 * 1024, capture = false, signal, onSpawn,
} = {}) {
  return new Promise((resolve) => {
    if (interrupted || signal?.aborted) return resolve({ code: null, reason: interrupted ? "interrupted" : "cancelled", stdout: "", exited: true });
    let child, timer, reason = null, size = 0, captured = 0;
    const chunks = [];
    const kill = () => {
      if (!child?.pid) return;
      try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
    };
    const stop = (why) => { reason ||= why; kill(); };
    const abort = () => stop("cancelled");
    try {
      child = spawn(command, args, { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      return resolve({ code: null, reason: "spawn_failed", stdout: "", exited: true });
    }
    enroll(stop);
    timer = setTimeout(() => stop("deadline"), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.once("spawn", () => {
      try { onSpawn?.(child.pid); } catch { stop("spawn_gate_failed"); }
    });
    child.once("error", () => { reason ||= "spawn_failed"; kill(); });
    child.stdin.on("error", () => stop("input_disconnected"));
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("error", () => stop("output_disconnected"));
      stream.on("data", (bytes) => {
        size += bytes.length;
        if (size > outputLimit) return stop("output_limit");
        if (capture && stream === child.stdout) {
          captured += bytes.length;
          if (captured > stdoutLimit) return stop("stdout_limit");
          chunks.push(bytes);
        }
      });
    }
    // Also terminate descendants which inherited pipes after the main child exits.
    child.once("exit", kill);
    child.once("close", (code, signalName) => {
      clearTimeout(timer);
      release(stop);
      signal?.removeEventListener("abort", abort);
      resolve({ code, signal: signalName, reason, stdout: reason ? "" : Buffer.concat(chunks).toString("utf8"),
        exited: true, pid: child.pid ?? null });
    });
    child.stdin.end(input);
  });
}
