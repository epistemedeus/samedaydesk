import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { startDisposablePg } from "../../../server/scripts/fixtures/disposable-pg.mjs";
import { PostgresStore } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/store/postgres.js";
import { hashToken, hashRequest } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { WorkCellStore } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/visitor-work-cells/store.js";

export const example = async name => JSON.parse(await readFile(new URL(`../examples/${name}.json`, import.meta.url), "utf8"));
const root = fileURLToPath(new URL("../../../", import.meta.url));

export async function boot(databaseUrl, port = 0) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./server-child.mjs", import.meta.url))], {
    cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH, NODE_ENV: "test", USEFUL_TEST_DATABASE_URL: databaseUrl, USEFUL_TEST_PORT: String(port) },
  });
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} reject(Error("server start deadline")); }, 10_000);
    child.once("message", message => { clearTimeout(timer); resolve(message); });
    child.once("exit", () => { clearTimeout(timer); reject(Error("server start failed")); });
    child.once("error", () => { clearTimeout(timer); reject(Error("server start unavailable")); });
  });
  // Drain bounded diagnostics; never copy raw environment, headers or SQL errors.
  let output = 0;
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    output += chunk.length;
    if (output > 8192) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
  });
  const message = await started;
  return { child, origin: message.origin, async close() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.send("stop");
    });
  } };
}

export async function fixture() {
  const cluster = await startDisposablePg();
  const dir = await mkdtemp(join(tmpdir(), "sds-useful-journey-qa-"));
  const base = new PostgresStore(cluster.url, { schema: "pilot_correspondence", poolMax: 2 });
  const cells = new WorkCellStore(cluster.url, { schema: "pilot_correspondence", poolMax: 2 });
  let server;
  const sql = new pg.Client({ connectionString: cluster.url, statement_timeout: 3000, query_timeout: 4000 });
  await sql.connect();
  await base.migrate(); await cells.migrate();
  await sql.query("SET search_path TO pilot_correspondence");
  async function tenant(name) {
    const token = `qa-owner-${name}-only-for-disposable-store`;
    const created = await base.createProject({ title: `QA ${name}`, summary: "Disposable owner QA; no live participant or reward.",
      ownerTokenHash: hashToken(token), ownerTokenPlainForReplay: token, idempotencyKey: `qa-project-${name}`, requestHash: hashRequest({ name }) });
    return { projectId: created.project.id, token };
  }
  const a = await tenant("a"), b = await tenant("b");
  const writer = { projectId: a.projectId, token: "qa-writer-a-only-for-disposable-store" };
  const reader = { projectId: a.projectId, token: "qa-reader-a-only-for-disposable-store" };
  writer.grant = (await base.createGrant({ projectId: a.projectId, role: "writer", tokenHash: hashToken(writer.token), expiresAt: null })).grant;
  reader.grant = (await base.createGrant({ projectId: a.projectId, role: "reader", tokenHash: hashToken(reader.token), expiresAt: null })).grant;
  server = await boot(cluster.url);
  return { dir, cluster, base, cells, sql, a, b, writer, reader,
    get origin() { return server.origin; },
    get processId() { return server.child.pid; },
    async restart({ crash = false } = {}) {
      const port = new URL(server.origin).port;
      if (crash) {
        const exited = new Promise(resolve => server.child.once("exit", resolve));
        process.kill(-server.child.pid, "SIGKILL");
        await exited;
      } else await server.close();
      server = await boot(cluster.url, port);
    },
    async close() { await server?.close(); await sql.end(); await cells.close(); await base.close(); await cluster.stop(); await rm(dir, { recursive: true, force: true }); },
  };
}

export async function request(origin, context, path, { method = "GET", body, key } = {}) {
  const response = await fetch(`${origin}/api/hosted-useful/projects/${context.projectId}/jobs${path}`, { method,
    headers: { authorization: `Bearer ${context.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(key ? { "idempotency-key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  return { status: response.status, json: await response.json() };
}

export async function lossyProxy(origin) {
  let lose;
  const server = createServer((req, res) => {
    const shouldDrop = lose && req.method === "POST" && lose(req.url);
    if (shouldDrop) lose = null;
    const upstream = httpRequest(new URL(req.url, origin), { method: req.method, headers: req.headers }, reply => {
      if (shouldDrop) {
        reply.resume();
        reply.once("end", () => res.destroy()); // actual server commit/reply happened
      } else {
        res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
      }
    });
    upstream.setTimeout(12_000, () => upstream.destroy());
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, dropNext(predicate) { lose = predicate; },
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); } };
}

export async function cold(args, { token, stdin, holdStdin = false } = {}) {
  return await new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../cold-client.mjs", import.meta.url)), ...args], {
      cwd: tmpdir(), detached: true, env: { PATH: process.env.PATH, ...(token ? { USEFUL_JOURNEY_TOKEN: token } : {}) }, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 15_000);
    child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > 131_072) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-1024); });
    child.stdin.on("error", () => {});
    if (!holdStdin) child.stdin.end(stdin);
    child.once("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout) : null }); });
  });
}
