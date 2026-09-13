import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { D14_DIR, REPO_ROOT } from "../lib/pins.mjs";

export const cli = join(D14_DIR, "bin/http-consumer.mjs");
export const fixtureBefore = join(D14_DIR, "fixtures/caller/vendor-budget-impact/before.json");
export const fixtureAfter = join(D14_DIR, "fixtures/caller/vendor-budget-impact/after.json");
export const paymentPath = join(REPO_ROOT, "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json");

export function tmpWork(prefix = "w5-d14-") {
  return mkdtempSync(join(process.env.TMPDIR || tmpdir(), prefix));
}

export function uniquePair() {
  const work = tmpWork();
  const nonce = `w5-d14-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const before = JSON.parse(readFileSync(fixtureBefore, "utf8"));
  const after = JSON.parse(readFileSync(fixtureAfter, "utf8"));
  before.note = `${before.note} nonce=${nonce}`;
  after.note = `${after.note} nonce=${nonce}`;
  const beforePath = join(work, "before.json");
  const afterPath = join(work, "after.json");
  writeFileSync(beforePath, `${JSON.stringify(before, null, 2)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);
  return { work, nonce, beforePath, afterPath, before, after };
}

export function runCli(argv, { cwd = REPO_ROOT, timeout = 120_000, env = {}, permission = null } = {}) {
  const nodeArgs = [];
  if (permission) {
    nodeArgs.push("--permission");
    for (const p of permission.allowRead || []) nodeArgs.push(`--allow-fs-read=${p}`);
    for (const p of permission.allowWrite || []) nodeArgs.push(`--allow-fs-write=${p}`);
  }
  nodeArgs.push(cli, ...argv);
  return spawnSync(process.execPath, nodeArgs, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=768", ...env },
  });
}

export async function runCliAsync(argv, opts = {}) {
  const { child, done } = spawnCli(argv, opts);
  const timeout = opts.timeout || 120_000;
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`runCliAsync timeout: ${argv.join(" ")}`));
    }, timeout);
    done.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

export function spawnCli(argv, { cwd = REPO_ROOT, env = {} } = {}) {
  const child = spawn(process.execPath, [cli, ...argv], {
    cwd,
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=768", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => {
    stdout += c.toString("utf8");
  });
  child.stderr.on("data", (c) => {
    stderr += c.toString("utf8");
  });
  const done = new Promise((resolve) => {
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  return { child, done, get stdout() { return stdout; }, get stderr() { return stderr; } };
}

export function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, origin: `http://127.0.0.1:${addr.port}` });
    });
  });
}

export function closeServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}
