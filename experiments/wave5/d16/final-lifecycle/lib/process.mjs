import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export function pgrepNeedle(needle) {
  const r = spawnSync("pgrep", ["-af", needle], { encoding: "utf8" });
  const rows = [];
  for (const line of String(r.stdout || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(" ");
    const pid = Number(space === -1 ? trimmed : trimmed.slice(0, space));
    const cmd = space === -1 ? "" : trimmed.slice(space + 1);
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) continue;
    if (cmd.includes("pgrep")) continue;
    rows.push({ pid, cmd });
  }
  return rows;
}

export function killPid(pid, signal = "SIGKILL") {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

export function killPidFile(pidFile) {
  if (!pidFile || !existsSync(pidFile)) return [];
  const killed = [];
  for (const line of readFileSync(pidFile, "utf8").split("\n")) {
    const pid = Number(line.trim());
    if (killPid(pid)) killed.push(pid);
  }
  return killed;
}

export function killIsolate(isolate) {
  if (!isolate) return [];
  const killed = [];
  for (const row of pgrepNeedle(isolate)) {
    if (killPid(row.pid)) killed.push(row.pid);
  }
  return killed;
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function spawnNode(args, { cwd, env, timeoutMs, detached = false } = {}) {
  return spawn(process.execPath, args, {
    cwd,
    env: env || process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached,
    timeout: timeoutMs,
  });
}

export function spawnNodeSync(args, { cwd, env, timeoutMs } = {}) {
  return spawnSync(process.execPath, args, {
    cwd,
    env: env || process.env,
    encoding: "utf8",
    timeout: timeoutMs ?? 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
