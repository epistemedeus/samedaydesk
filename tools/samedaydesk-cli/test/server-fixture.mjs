// Loopback HTTP fixtures for tests. They speak the same wire shapes as the
// backend routes the CLI calls; they prove client behavior, not live service.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BIN = resolve(ROOT, "bin/samedaydesk.mjs");

export async function startServer(route) {
  const requests = [];
  const sockets = new Set();
  let inFlight = 0;
  let maxInFlight = 0;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
    const entry = { method: req.method, url: req.url, headers: { ...req.headers }, body };
    requests.push(entry);
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    res.once("close", () => { inFlight -= 1; });
    try { await route(req, res, entry); }
    catch { if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" }); res.end('{"error":{"code":"fixture_failed"}}'); } }
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, requests, server,
    get maxInFlight() { return maxInFlight; },
    close: () => new Promise(done => { for (const socket of sockets) socket.destroy(); server.close(() => done()); }),
  };
}

export function sendJson(res, status, value, headers = {}) {
  if (res.destroyed) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(value));
}

export const delay = ms => new Promise(done => setTimeout(done, ms));

// Runs the installed bin in a child process. Returns the child and helpers.
export function spawnCli(args, { stdinText = null, env = {} } = {}) {
  const child = spawn(process.execPath, [BIN, ...args], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...env } });
  const out = []; const err = [];
  child.stdout.on("data", chunk => out.push(chunk));
  child.stderr.on("data", chunk => err.push(chunk));
  if (stdinText !== null) child.stdin.end(stdinText); else child.stdin.end();
  const exited = new Promise(done => child.on("exit", (code, signal) => done({ code, signal })));
  return {
    child, exited,
    stdout: () => Buffer.concat(out).toString("utf8"),
    stderr: () => Buffer.concat(err).toString("utf8"),
    lines: () => Buffer.concat(out).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)),
  };
}

export async function waitFor(predicate, { timeoutMs = 10000, stepMs = 20 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) { if (await predicate()) return true; await delay(stepMs); }
  throw new Error("waitFor timed out");
}
