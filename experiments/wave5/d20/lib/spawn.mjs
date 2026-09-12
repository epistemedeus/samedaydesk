import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export function waitForFile(filePath, timeoutMs = 30_000) {
  const start = Date.now();
  while (!existsSync(filePath)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout waiting for ${filePath}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  return readFileSync(filePath);
}

export function waitForFileMatch(filePath, predicate, timeoutMs = 30_000) {
  const start = Date.now();
  while (true) {
    if (existsSync(filePath)) {
      const text = readFileSync(filePath, "utf8");
      if (predicate(text)) return text;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout waiting for match in ${filePath}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
}

export function runNode(bin, args, { cwd, timeout = 120_000, env } = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(env || {}) },
  });
}

export function parseJsonStdout(result) {
  const text = String(result.stdout || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(
      `not JSON status=${result.status} stdout=${text.slice(0, 400)} stderr=${result.stderr}`,
    );
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function commitThenLose({
  bin,
  args,
  cwd,
  commitPath,
  commitMatch,
  env,
  timeoutMs = 60_000,
}) {
  const child = spawn(process.execPath, [bin, ...args], {
    cwd,
    env: { ...process.env, ...(env || {}) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  try {
    if (commitMatch) waitForFileMatch(commitPath, commitMatch, timeoutMs);
    else waitForFile(commitPath, timeoutMs);
  } catch (err) {
    child.kill("SIGKILL");
    throw new Error(`${err.message} stderr=${stderr}`);
  }
  child.kill("SIGKILL");
  const start = Date.now();
  while (child.exitCode === null && child.signalCode === null) {
    if (Date.now() - start > 8_000) {
      child.kill("SIGKILL");
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  return {
    stdoutLost: true,
    commitPath,
    signal: child.signalCode,
    exitCode: child.exitCode,
    stderr,
  };
}
