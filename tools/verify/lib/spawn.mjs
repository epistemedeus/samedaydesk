import { spawn } from "node:child_process";

export function runCommand(argv, options = {}) {
  const {
    cwd,
    env = process.env,
    timeoutMs = 120_000,
    input = null,
    inherit = false,
  } = options;
  if (!Array.isArray(argv) || argv.length === 0) {
    return Promise.resolve({
      code: 2,
      signal: null,
      stdout: "",
      stderr: "empty argv",
      argv,
      timedOut: false,
    });
  }

  return new Promise((resolve) => {
    const [cmd, ...args] = argv;
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    if (!inherit) {
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      if (input != null) child.stdin.write(input);
      child.stdin.end();
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        code: 64,
        signal: null,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${error.message}\n`,
        argv,
        timedOut: false,
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: code == null ? 1 : code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        argv,
        timedOut,
      });
    });
  });
}

export function clip(text, max = 4000) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[clipped ${value.length - max} chars]`;
}

export function parseJsonOutput(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function spawnHost(argv, { cwd, env = process.env, detached = false } = {}) {
  const [cmd, ...args] = argv;
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached,
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  if (detached) child.unref();
  return {
    child,
    pid: child.pid,
    stdout,
    stderr,
    output() {
      return {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
    },
  };
}

export const spawnDetached = (argv, options = {}) => spawnHost(argv, { ...options, detached: true });
