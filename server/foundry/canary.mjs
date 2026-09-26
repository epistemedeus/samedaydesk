#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const pgBin = "/usr/lib/postgresql/16/bin";
const preload = fileURLToPath(new URL("../scripts/fixtures/hosted-startup-preload.mjs", import.meta.url));
const port = 55432;

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://<redacted>");
}

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => { stdout += buf; });
    child.stderr.on("data", (buf) => { stderr += buf; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr: redact(stderr) }));
  });
}

async function bootServer(databaseUrl, adminToken) {
  const child = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      PORT: "0",
      FOUNDRY_HOST_OPT_IN: "1",
      CORRESPONDENCE_DATABASE_URL: databaseUrl,
      CORRESPONDENCE_ADMIN_TOKEN: adminToken,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      CORRESPONDENCE_POOL_MAX: "2",
      CORRESPONDENCE_STORE: "postgres",
      CORRESPONDENCE_TRUST_PROXY: "0",
      CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
      ...(process.env.FOUNDRY_CANARY_F93_ROOT ? { FOUNDRY_F93_ROOT: process.env.FOUNDRY_CANARY_F93_ROOT } : {}),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr.on("data", (buf) => { stderr = (stderr + redact(buf.toString())).slice(-2000); });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not listen: " + stderr)), 8000);
    child.once("message", (msg) => { clearTimeout(timer); resolve(msg); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${stderr}`)); });
  });
  return { child, port: message.port, stderr };
}

async function stopServer(child) {
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  const [code, signal] = await exited;
  clearTimeout(timer);
  return { code, signal };
}

async function tables(client) {
  const result = await client.query(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_name LIKE 'correspondence%' ORDER BY 1, 2`,
  );
  return result.rows;
}

export async function runCanary() {
  const dir = await mkdtemp(path.join(tmpdir(), "vf-host-canary-"));
  const dataDir = path.join(dir, "pg");
  const adminToken = `canary-${randomBytes(18).toString("hex")}`;
  const databaseUrl = `postgres://canary@127.0.0.1:${port}/correspondence`;
  const steps = [];
  const record = (name, detail) => steps.push({ name, ...detail });
  let client;
  try {
    const init = await run(path.join(pgBin, "initdb"), [
      "-D", dataDir, "-U", "canary", "--auth-local=trust", "--auth-host=trust", "--locale=C", "--encoding=UTF8",
    ], { PATH: process.env.PATH });
    if (init.code !== 0) throw new Error(init.stderr || "initdb failed");
    await appendFile(path.join(dataDir, "postgresql.conf"), `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = '${dataDir}'\n`);
    const started = await run(path.join(pgBin, "pg_ctl"), ["-D", dataDir, "-l", path.join(dir, "pg.log"), "-w", "start"]);
    if (started.code !== 0) throw new Error(started.stderr || "pg_ctl start failed");
    const created = await run(path.join(pgBin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "canary", "correspondence"]);
    if (created.code !== 0) throw new Error(created.stderr || "createdb failed");

    client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 4000 });
    await client.connect();
    await client.query("CREATE SCHEMA canary_sentinel");
    await client.query("CREATE TABLE canary_sentinel.keep (id int primary key)");
    await client.query("INSERT INTO canary_sentinel.keep VALUES (1)");

    const early = await run(process.execPath, ["server/foundry/migrate.mjs", "--apply"], {
      CORRESPONDENCE_DATABASE_URL: databaseUrl,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    });
    record("additive-before-base", { exitCode: early.code, stderr: early.stderr.trim() });
    if (early.code === 0) throw new Error("additive migration ran before the base schema");

    const base = await run(process.execPath, ["vendor/neomorphic-correspondence/dist/migrate.js"], {
      CORRESPONDENCE_DATABASE_URL: databaseUrl,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    });
    record("base-migrate", { exitCode: base.code, stdout: base.stdout.trim() });
    if (base.code !== 0) throw new Error(base.stderr || "base migrate failed");

    const before = await tables(client);
    record("tables-after-base", { tables: before });
    if (before.some((row) => row.table_name.startsWith("correspondence_vf04_"))) {
      throw new Error("foundry tables appeared before the additive migration");
    }

    const first = await bootServer(databaseUrl, adminToken);
    const origin = `http://127.0.0.1:${first.port}`;
    const health = await fetch(origin + "/api/health");
    const healthz = await fetch(origin + "/api/correspondence/healthz");
    const foundry = await fetch(origin + "/api/correspondence/foundry-receiver");
    const uploads = await fetch(origin + "/api/uploads/signed-url", { method: "POST" });
    const firstStop = await stopServer(first.child);
    record("entrypoint-before-additive", {
      health: health.status,
      healthBody: await health.json(),
      healthz: healthz.status,
      healthzBody: await healthz.json(),
      foundry: foundry.status,
      foundryBody: await foundry.json(),
      uploads: uploads.status,
      shutdown: firstStop,
    });

    const additive = await run(process.execPath, ["server/foundry/migrate.mjs", "--apply"], {
      CORRESPONDENCE_DATABASE_URL: databaseUrl,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    });
    record("additive-migrate", { exitCode: additive.code, stdout: additive.stdout.trim(), stderr: additive.stderr.trim() });
    if (additive.code !== 0) throw new Error(additive.stderr || "additive migrate failed");
    const again = await run(process.execPath, ["server/foundry/migrate.mjs", "--apply"], {
      CORRESPONDENCE_DATABASE_URL: databaseUrl,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    });
    record("additive-migrate-repeat", { exitCode: again.code });
    if (again.code !== 0) throw new Error("repeat additive migration failed");

    const after = await tables(client);
    const sentinel = await client.query("SELECT id FROM canary_sentinel.keep");
    record("tables-after-additive", {
      schemas: [...new Set(after.map((row) => row.table_schema))],
      names: after.map((row) => `${row.table_schema}.${row.table_name}`),
      sentinel: sentinel.rows,
    });

    const second = await bootServer(databaseUrl, adminToken);
    const origin2 = `http://127.0.0.1:${second.port}`;
    const health2 = await fetch(origin2 + "/api/health");
    const healthz2 = await fetch(origin2 + "/api/correspondence/healthz");
    const secondStop = await stopServer(second.child);
    record("restart", {
      health: health2.status,
      healthBody: await health2.json(),
      healthz: healthz2.status,
      healthzBody: await healthz2.json(),
      shutdown: secondStop,
    });

    return {
      ok: true,
      notProduction: true,
      connectionShape: {
        protocol: "postgresql",
        host: "127.0.0.1",
        port,
        database: "correspondence",
        user: "canary",
        password: "redacted-none",
        schema: "pilot_correspondence",
        applicationName: "sds_foundry_migrate",
      },
      steps,
    };
  } finally {
    if (client) await client.end().catch(() => {});
    await run(path.join(pgBin, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    const evidence = await runCanary();
    process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(redact(error instanceof Error ? error.stack || error.message : error) + "\n");
    process.exit(1);
  }
}
