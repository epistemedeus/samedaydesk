#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { chmod, copyFile, mkdtemp, rm, appendFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const pgBin = "/usr/lib/postgresql/16/bin";
const preload = fileURLToPath(new URL("../scripts/fixtures/hosted-startup-preload.mjs", import.meta.url));
const port = 55442;

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

async function bootServer(databaseUrl, adminToken, files) {
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
      CORRESPONDENCE_POOL_MAX: "1",
      CORRESPONDENCE_STORE: "postgres",
      CORRESPONDENCE_TRUST_PROXY: "0",
      CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
      FOUNDRY_HOST_PROFILE_FILE: files.hostProfile,
      FOUNDRY_PARTICIPATION_KEY_FILE: files.participationKey,
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

    const receiverRoot = path.join(repoRoot, "vendor/visitor-foundry-receiver");
    const hostProfile = path.join(dir, "host-profile.json");
    const privateProfile = path.join(dir, "private-profile.json");
    const participationKey = path.join(dir, "participation.key");
    await copyFile(path.join(receiverRoot, "scripts/visitor-foundry/integration/entry/host-profile.example.json"), hostProfile);
    await copyFile(path.join(receiverRoot, "scripts/visitor-foundry/integration/entry/private-profile.example.json"), privateProfile);
    await writeFile(participationKey, "vf12-canary-host-private-purpose-key-32\n", { mode: 0o600 });
    await chmod(hostProfile, 0o600);
    await chmod(privateProfile, 0o600);
    const files = { hostProfile, privateProfile, participationKey };
    const installEnv = {
      CORRESPONDENCE_DATABASE_URL: databaseUrl,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      FOUNDRY_HOST_PROFILE_FILE: hostProfile,
      FOUNDRY_PARTICIPATION_KEY_FILE: participationKey,
      FOUNDRY_PRIVATE_PROFILE_FILE: privateProfile,
    };

    const early = await run(process.execPath, ["--input-type=module", "-e", `
      import { WorkCellStore } from "./vendor/visitor-foundry-receiver/services/correspondence/dist/visitor-work-cells/index.js";
      const cells = new WorkCellStore(process.env.CORRESPONDENCE_DATABASE_URL, { schema: "pilot_correspondence", poolMax: 1 });
      try { await cells.migrate(); process.exit(0); }
      catch (error) { console.error(error.message); process.exit(1); }
      finally { await cells.close(); }
    `], { CORRESPONDENCE_DATABASE_URL: databaseUrl });
    record("additive-before-base", { exitCode: early.code, stderr: early.stderr.trim() });
    if (early.code === 0) throw new Error("additive migration ran before the base schema");

    const base = await run(process.execPath, ["server/foundry/install.mjs", "--migrate"], installEnv);
    record("ordered-migrate", { exitCode: base.code, stdout: base.stdout.trim(), stderr: base.stderr.trim() });
    if (base.code !== 0) throw new Error(base.stderr || "ordered migrate failed");

    const migrated = await tables(client);
    record("tables-after-migrate", {
      names: migrated.map((row) => `${row.table_schema}.${row.table_name}`),
    });
    for (const name of ["correspondence_projects", "correspondence_vf02_work_cells", "correspondence_vf04_pools", "correspondence_vf10_installation", "correspondence_vf12_host"]) {
      if (!migrated.some((row) => row.table_schema === "pilot_correspondence" && row.table_name === name)) {
        throw new Error(`missing ${name} after ordered migrate`);
      }
    }

    const uninstalled = await bootServer(databaseUrl, adminToken, files);
    const origin = `http://127.0.0.1:${uninstalled.port}`;
    const health = await fetch(origin + "/api/health");
    const healthz = await fetch(origin + "/api/correspondence/healthz");
    const uploads = await fetch(origin + "/api/uploads/signed-url", { method: "POST" });
    const firstStop = await stopServer(uninstalled.child);
    const healthBody = await health.json();
    const healthzBody = await healthz.json();
    record("startup-before-install", {
      health: health.status,
      healthBody,
      healthz: healthz.status,
      healthzBody,
      uploads: uploads.status,
      shutdown: firstStop,
    });
    if (health.status !== 200 || healthBody.service !== "samedaydesk") throw new Error("SDS health failed before install");
    if (healthzBody.enabled !== false) throw new Error("startup served the addon before profile installation");
    if (uploads.status !== 501) throw new Error("uploads changed from 501");

    const installed = await run(process.execPath, ["server/foundry/install.mjs", "--migrate", "--install"], installEnv);
    record("install", { exitCode: installed.code, stdout: installed.stdout.trim(), stderr: installed.stderr.trim() });
    if (installed.code !== 0) throw new Error(installed.stderr || "install failed");
    const repeat = await run(process.execPath, ["server/foundry/install.mjs", "--migrate", "--install"], installEnv);
    record("install-repeat", { exitCode: repeat.code, stdout: repeat.stdout.trim() });
    if (repeat.code !== 0) throw new Error("repeat install failed");
    const firstInstall = JSON.parse(installed.stdout);
    const secondInstall = JSON.parse(repeat.stdout);
    if (firstInstall.charged !== 0 || secondInstall.charged !== firstInstall.charged) {
      throw new Error("install changed the charged count");
    }
    if (firstInstall.termsHash !== secondInstall.termsHash || firstInstall.configId !== secondInstall.configId) {
      throw new Error("repeat install changed terms or config");
    }

    const after = await tables(client);
    const sentinel = await client.query("SELECT id FROM canary_sentinel.keep");
    record("tables-after-install", {
      schemas: [...new Set(after.map((row) => row.table_schema))],
      names: after.map((row) => `${row.table_schema}.${row.table_name}`),
      sentinel: sentinel.rows,
      charged: secondInstall.charged,
    });

    const second = await bootServer(databaseUrl, adminToken, files);
    const origin2 = `http://127.0.0.1:${second.port}`;
    const health2 = await fetch(origin2 + "/api/health");
    const healthz2 = await fetch(origin2 + "/api/correspondence/healthz");
    const secondStop = await stopServer(second.child);
    const health2Body = await health2.json();
    const healthz2Body = await healthz2.json();
    record("restart", {
      health: health2.status,
      healthBody: health2Body,
      healthz: healthz2.status,
      healthzBody: healthz2Body,
      shutdown: secondStop,
    });
    if (health2.status !== 200 || healthz2Body.enabled !== true || healthz2Body.store !== "postgres") {
      throw new Error("installed restart was not ready");
    }
    if (secondStop.code !== 0) throw new Error("SIGTERM shutdown failed");

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
