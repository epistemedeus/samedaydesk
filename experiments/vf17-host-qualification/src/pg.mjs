// Disposable cluster shaped like VF11 privatePG: loopback only, owned stop,
// max_connections 24, 32MB shared_buffers, 2MB work_mem, fsync on.
// Never reads a caller database URL and never stops a process outside this directory.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";
import { CLUSTER } from "./plan.mjs";
import { redact } from "./redact.mjs";

function pgBin() {
  return resolve(process.env.VF17_PG_BIN || process.env.VF11_PG_BIN || "/usr/lib/postgresql/16/bin");
}

function run(bin, program, args, timeout = 25000) {
  try {
    return execFileSync(join(bin, program), args, {
      timeout,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const stderr = redact(err.stderr || err.message || "");
    throw new Error(`${program} failed: ${stderr.slice(-2000)}`);
  }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, CLUSTER.listenHost, () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

function logTail(file) {
  try {
    return redact(readFileSync(file, "utf8")).slice(-2000);
  } catch {
    return "";
  }
}

function killOwnedPostmaster(pid, dataDir) {
  if (!Number.isInteger(pid) || pid <= 1) return;
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    if (!cmdline.includes(dataDir)) return;
    process.kill(pid, "SIGKILL");
  } catch {
    // The postmaster is already gone.
  }
}

export async function privatePG() {
  const bin = pgBin();
  if (!existsSync(join(bin, "initdb"))) {
    throw new Error(`Set VF17_PG_BIN to PostgreSQL 16 binaries. Missing ${join(bin, "initdb")}`);
  }
  const local = join(tmpdir(), `vf17-pg-${process.pid}-${randomBytes(4).toString("hex")}`);
  const data = join(local, "data");
  mkdirSync(local, { recursive: true, mode: 0o700 });
  const port = await freePort();
  const ownerPassword = randomBytes(24).toString("hex");
  const clientPassword = randomBytes(24).toString("hex");
  const passwordFile = join(local, "owner-password");
  writeFileSync(passwordFile, ownerPassword, { mode: 0o600 });
  const logFile = join(local, "postgres.log");
  let started = false;
  let stopped = false;
  let pid = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (started) {
      try {
        run(bin, "pg_ctl", ["-D", data, "-m", "immediate", "-w", "-t", "10", "stop"], 15000);
      } catch {
        killOwnedPostmaster(pid, data);
      }
    }
    rmSync(local, { recursive: true, force: true });
  };

  try {
    run(bin, "initdb", [
      "-D", data,
      "-U", "vf17_owner",
      "--pwfile", passwordFile,
      "--auth-host=scram-sha-256",
      "--auth-local=trust",
      "--encoding=UTF8",
      "--no-locale",
    ]);
    writeFileSync(join(data, "postgresql.auto.conf"), [
      `listen_addresses = '${CLUSTER.listenHost}'`,
      `port = ${port}`,
      "unix_socket_directories = ''",
      `max_connections = ${CLUSTER.maxConnections}`,
      `shared_buffers = '${CLUSTER.sharedBuffers}'`,
      `work_mem = '${CLUSTER.workMem}'`,
      "fsync = on",
      "synchronous_commit = on",
      "timezone = 'UTC'",
      "track_io_timing = on",
      "password_encryption = 'scram-sha-256'",
      "",
    ].join("\n"));
    run(bin, "pg_ctl", ["-D", data, "-l", logFile, "-w", "-t", "15", "start"]);
    started = true;
    pid = Number(readFileSync(join(data, "postmaster.pid"), "utf8").split("\n")[0]);
    const version = run(bin, "postgres", ["--version"]).trim();
    const endpoint = {
      host: CLUSTER.listenHost,
      port,
      database: "postgres",
    };
    return {
      stop,
      pid,
      version,
      owner: { ...endpoint, user: "vf17_owner", password: ownerPassword },
      client: { ...endpoint, user: "vf17_client", password: clientPassword },
      secrets: [ownerPassword, clientPassword],
    };
  } catch (err) {
    const tail = logTail(logFile);
    stop();
    throw new Error(`${err.message}${tail ? `\n${tail}` : ""}`);
  }
}
