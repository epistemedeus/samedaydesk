import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const bin = "/usr/lib/postgresql/16/bin";

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
