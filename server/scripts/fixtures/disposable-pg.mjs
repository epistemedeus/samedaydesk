import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { accessSync, constants, statSync } from "node:fs";
import net from "node:net";
import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const REQUIRED_BINARIES = ["initdb", "pg_ctl", "createdb", "postgres"];

function validBin(dir) {
  if (typeof dir !== "string" || !path.isAbsolute(dir) || /[\r\n\0]/.test(dir)) return false;
  return REQUIRED_BINARIES.every((name) => {
    try {
      const file = path.join(dir, name);
      if (!statSync(file).isFile()) return false;
      accessSync(file, constants.X_OK);
      return true;
    } catch { return false; }
  });
}

export function resolvePostgresBin(env = process.env) {
  if (Object.hasOwn(env, "PULSE_PG_BIN")) {
    if (validBin(env.PULSE_PG_BIN)) return path.resolve(env.PULSE_PG_BIN);
    throw Object.assign(new Error("PULSE_PG_BIN must name an absolute directory containing executable initdb, pg_ctl, createdb and postgres"), { code: "postgres_bin_invalid" });
  }
  const found = spawnSync("pg_config", ["--bindir"], {
    env: { PATH: env.PATH || "" }, encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
  const configured = found.status === 0 ? found.stdout.trim() : "";
  if (validBin(configured)) return path.resolve(configured);
  for (const dir of String(env.PATH || "").split(path.delimiter)) {
    if (validBin(dir)) return path.resolve(dir);
  }
  throw Object.assign(new Error("disposable postgres binaries unavailable; set PULSE_PG_BIN or provide pg_config / a complete PostgreSQL bin directory on PATH"), { code: "postgres_bin_unavailable" });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { PATH: process.env.PATH || "" } });
    let stderr = "";
    child.stderr.on("data", (buf) => { stderr += buf; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stderr }));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function startDisposablePg() {
  const bin = resolvePostgresBin();
  const dir = await mkdtemp(path.join(tmpdir(), "sds-vf12-pg-"));
  const dataDir = path.join(dir, "pg");
  const port = await freePort();
  const init = await run(path.join(bin, "initdb"), [
    "-D", dataDir, "-U", "sds", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8", "--locale=C",
  ]);
  if (init.code !== 0) throw new Error(init.stderr || "initdb failed");
  await appendFile(path.join(dataDir, "postgresql.conf"),
    `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nmax_connections = 40\nunix_socket_directories = '${dataDir}'\nfsync = on\nsynchronous_commit = on\n`);
  const started = await run(path.join(bin, "pg_ctl"), ["-D", dataDir, "-l", path.join(dir, "pg.log"), "-w", "-t", "20", "start"]);
  if (started.code !== 0) throw new Error(started.stderr || "pg_ctl start failed");
  const created = await run(path.join(bin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "sds", "correspondence"]);
  if (created.code !== 0) throw new Error(created.stderr || "createdb failed");
  const url = `postgres://sds@127.0.0.1:${port}/correspondence`;
  return {
    bin,
    url,
    port,
    dir,
    async stop() {
      await run(path.join(bin, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "-t", "10", "stop"]);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function spawnNode(args, env) {
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  return child;
}

export function onceExit(child) {
  return once(child, "exit");
}
