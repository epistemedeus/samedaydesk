import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import pg from "pg";

const MARK = `${sep}ae14-j1-pg-`;

export function assertVerifyFull(connectionString) {
  let mode = null;
  try { mode = new URL(connectionString).searchParams.get("sslmode"); } catch { mode = null; }
  if (mode !== "verify-full") {
    const error = new Error("tls_verify_full_required");
    error.code = "tls_verify_full_required";
    throw error;
  }
  return connectionString;
}

export function connectionString({ username, port, database, caFile, certFile, keyFile }) {
  const query = new URLSearchParams({
    sslmode: "verify-full",
    sslrootcert: caFile,
    sslcert: certFile,
    sslkey: keyFile,
  });
  return assertVerifyFull(`postgresql://${username}@127.0.0.1:${port}/${database}?${query}`);
}

function openssl(args, cwd) {
  execFileSync("openssl", args, { cwd, stdio: ["ignore", "ignore", "pipe"], timeout: 20000 });
}

function writeCerts(dir, username) {
  mkdirSync(dir, { recursive: true });
  openssl(["genrsa", "-out", "ca.key", "2048"], dir);
  openssl(["req", "-x509", "-new", "-key", "ca.key", "-out", "ca.crt", "-days", "2", "-subj", "/CN=ae14-j1-throwaway-ca"], dir);
  openssl(["genrsa", "-out", "server.key", "2048"], dir);
  openssl(["req", "-new", "-key", "server.key", "-out", "server.csr", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"], dir);
  openssl(["x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "2", "-copy_extensions", "copy"], dir);
  openssl(["genrsa", "-out", "client.key", "2048"], dir);
  openssl(["req", "-new", "-key", "client.key", "-out", "client.csr", "-subj", `/CN=${username}`], dir);
  openssl(["x509", "-req", "-in", "client.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "client.crt", "-days", "2"], dir);
  for (const name of ["ca.key", "server.key", "client.key"]) chmodSync(join(dir, name), 0o600);
  return {
    caFile: join(dir, "ca.crt"),
    certFile: join(dir, "client.crt"),
    keyFile: join(dir, "client.key"),
    serverCert: join(dir, "server.crt"),
    serverKey: join(dir, "server.key"),
  };
}

async function freePort() {
  const lease = createServer();
  await new Promise((resolveListen) => lease.listen(0, "127.0.0.1", resolveListen));
  const port = lease.address().port;
  await new Promise((resolveClose) => lease.close(resolveClose));
  return port;
}

function assertOwned(scratch, dataDir) {
  const resolved = resolve(dataDir);
  if (!resolve(scratch).startsWith(resolve(tmpdir())) || !resolved.includes(MARK) || !resolved.startsWith(resolve(scratch))) {
    throw new Error("refuse_foreign_cluster");
  }
}

export async function startCluster({ pgBin = process.env.AE14_PG_BIN ?? "/usr/lib/postgresql/16/bin", username = "ae14_j1" } = {}) {
  const dbName = `ae14_b_j1_${randomBytes(4).toString("hex")}`;
  const scratch = join(tmpdir(), `ae14-j1-pg-${randomBytes(6).toString("hex")}`);
  const dataDir = join(scratch, "data");
  mkdirSync(dataDir, { recursive: true });
  assertOwned(scratch, dataDir);
  let started = false;
  try {
    const tls = writeCerts(join(scratch, "tls"), username);
    execFileSync(resolve(pgBin, "initdb"), ["-D", dataDir, "--auth=trust", `--username=${username}`, "--encoding=UTF8", "--no-locale"], { stdio: "ignore", timeout: 20000 });
    const port = await freePort();
    appendFileSync(join(dataDir, "postgresql.conf"), [
      "",
      `port=${port}`,
      "listen_addresses='127.0.0.1'",
      `unix_socket_directories='${dataDir}'`,
      "shared_buffers='32MB'",
      "max_connections=40",
      "ssl=on",
      `ssl_cert_file='${tls.serverCert}'`,
      `ssl_key_file='${tls.serverKey}'`,
      `ssl_ca_file='${tls.caFile}'`,
      "ssl_min_protocol_version='TLSv1.2'",
      "",
    ].join("\n"));
    writeFileSync(join(dataDir, "pg_hba.conf"), [
      "# This run only. Plaintext and unverified clients are rejected.",
      "local     all  all                 reject",
      "hostnossl all  all  0.0.0.0/0      reject",
      "hostnossl all  all  ::/0           reject",
      "hostssl   all  all  127.0.0.1/32   trust clientcert=verify-full",
      "hostssl   all  all  ::1/128        reject",
      "",
    ].join("\n"));
    execFileSync(resolve(pgBin, "pg_ctl"), ["-D", dataDir, "-l", join(scratch, "postgres.log"), "-w", "start"], { stdio: "ignore", timeout: 15000 });
    started = true;
    const pid = Number(readFileSync(join(dataDir, "postmaster.pid"), "utf8").split("\n")[0]);
    writeFileSync(join(scratch, "owned.json"), JSON.stringify({ pid, dataDir, port, database: dbName, username, scratch }));
    const env = {
      ...process.env,
      PGHOST: "127.0.0.1",
      PGPORT: String(port),
      PGUSER: username,
      PGDATABASE: "postgres",
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: tls.caFile,
      PGSSLCERT: tls.certFile,
      PGSSLKEY: tls.keyFile,
    };
    execFileSync(resolve(pgBin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", username, dbName], { env, stdio: "ignore", timeout: 10000 });
    const url = connectionString({ username, port, database: dbName, ...tls });
    const admin = new pg.Client({ connectionString: connectionString({ username, port, database: dbName, ...tls }), connectionTimeoutMillis: 10000 });
    await admin.connect();
    const ssl = await admin.query("SHOW ssl");
    await admin.end();
    if (ssl.rows[0]?.ssl !== "on") throw new Error("ssl_not_on");
    return {
      scratch, dataDir, pid, port, database: dbName, username, connectionString: url, pgBin,
      async stop() { await stopCluster({ scratch, dataDir, pid, pgBin }); },
    };
  } catch (error) {
    if (started) {
      try { execFileSync(resolve(pgBin, "pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore", timeout: 15000 }); } catch { /* drop the scratch dir */ }
    }
    rmSync(scratch, { recursive: true, force: true });
    throw error;
  }
}

export async function stopCluster(cluster) {
  const pgBin = cluster.pgBin ?? process.env.AE14_PG_BIN ?? "/usr/lib/postgresql/16/bin";
  const scratch = resolve(cluster.scratch);
  const dataDir = resolve(cluster.dataDir);
  assertOwned(scratch, dataDir);
  const owned = JSON.parse(readFileSync(join(scratch, "owned.json"), "utf8"));
  if (resolve(owned.dataDir) !== dataDir || owned.pid !== cluster.pid) throw new Error("refuse_pid_mismatch");
  if (existsSync(join(dataDir, "postmaster.pid"))) {
    const live = Number(readFileSync(join(dataDir, "postmaster.pid"), "utf8").split("\n")[0]);
    if (live !== owned.pid) throw new Error("refuse_pid_mismatch");
    execFileSync(resolve(pgBin, "pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore", timeout: 15000 });
  }
  rmSync(scratch, { recursive: true, force: true });
}
