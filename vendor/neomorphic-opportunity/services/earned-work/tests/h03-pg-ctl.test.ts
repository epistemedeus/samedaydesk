import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import { OWNER_TOKEN, json, key } from "./helpers.js";

const kernelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG_BIN = "/usr/lib/postgresql/16/bin";
const FORBIDDEN = [5432, 55432];

function bin(name: string) {
  return path.join(PG_BIN, name);
}

function tcpOpen(port: number, host = "127.0.0.1", timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitTcp(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpOpen(port, "127.0.0.1", 250)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`127.0.0.1:${port} did not accept TCP`);
}

async function waitHealth(port: number, child: ChildProcess, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`kernel exited ${child.exitCode}: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        const body = (await response.json()) as { ok: boolean; store: string };
        if (body.ok === true && body.store === "postgres") return;
      }
    } catch {
      // booting
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`healthz timeout: ${stderr}`);
}

test(
  "H03-11 recheck: isolated pg_ctl stop does not exit 1; replay is one verdict",
  { timeout: 90_000 },
  async () => {
    assert.equal(existsSync(bin("pg_ctl")), true, "pg_ctl 16 required");
    const beforeForbidden: Record<number, boolean> = {};
    for (const port of FORBIDDEN) beforeForbidden[port] = await tcpOpen(port);

    const stamp = randomBytes(6).toString("hex");
    const pgdata = path.join(tmpdir(), `ew-h03-pg-${stamp}`);
    const pgPort = await freePort();
    const httpPort = await freePort();
    assert.notEqual(pgPort, 5432);
    assert.notEqual(pgPort, 55432);
    rmSync(pgdata, { recursive: true, force: true });
    mkdirSync(pgdata, { recursive: true });
    const pgLog = path.join(pgdata, "pg.log");
    execFileSync(bin("initdb"), ["-D", pgdata, "--auth=trust", "--username=earned_work"], {
      encoding: "utf8",
    });
    writeFileSync(
      path.join(pgdata, "postgresql.conf"),
      `${readFileSync(path.join(pgdata, "postgresql.conf"), "utf8")}
port = ${pgPort}
listen_addresses = '127.0.0.1'
unix_socket_directories = '${pgdata}'
`,
    );
    writeFileSync(
      path.join(pgdata, "pg_hba.conf"),
      `local all all trust
host all all 127.0.0.1/32 trust
host all all ::1/128 trust
`,
    );
    execFileSync(bin("pg_ctl"), ["-D", pgdata, "-l", pgLog, "-w", "start"], { encoding: "utf8" });
    await waitTcp(pgPort);
    const databaseUrl = `postgres://earned_work:earned_work@127.0.0.1:${pgPort}/earned_work_test`;
    let kernel: ChildProcess | null = null;
    try {
      // Dedicated schema-owner login `earned_work` for actual kernel boot + post-restart reconnect.
      // createPostgresStore always migrate()s; this is not a DML-only runtime.
      execFileSync(bin("createdb"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "earned_work", "earned_work_test"]);
      execFileSync("npm", ["run", "build"], { cwd: kernelRoot, stdio: "inherit" });
      const schema = `ewt_h03_${stamp}`;
      kernel = spawn(process.execPath, ["dist/index.js"], {
        cwd: kernelRoot,
        env: {
          ...process.env,
          PORT: String(httpPort),
          EARNED_WORK_PG_SCHEMA: schema,
          EARNED_WORK_DATABASE_URL: databaseUrl,
          EARNED_WORK_OWNER_TOKEN: OWNER_TOKEN,
          EARNED_WORK_POOL_MAX: "4",
          EARNED_WORK_RATE_LIMIT_MAX: "10000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let kernelLog = "";
      kernel.stderr?.on("data", (chunk) => {
        kernelLog += String(chunk);
      });
      kernel.stdout?.on("data", (chunk) => {
        kernelLog += String(chunk);
      });
      await waitHealth(httpPort, kernel);
      const baseUrl = `http://127.0.0.1:${httpPort}`;
      const preimage = "h03-pg-ctl-artifact\n";
      const artifact = {
        ref: "fixture:h03-not-fetched",
        digestSha256: createHash("sha256").update(preimage).digest("hex"),
        mediaType: "text/plain",
        bytes: Buffer.byteLength(preimage),
      };
      const created = await json(baseUrl, "/v1/tasks", {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key("h03-create"),
        body: JSON.stringify({
          title: "H03 pg_ctl recheck",
          summary: "test provenance — isolated pg_ctl, not production",
          provenance: "test",
          reward: { amount: "0.10", asset: "USDC", network: "base" },
          budget: { amount: "0.10", asset: "USDC", network: "base" },
        }),
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const taskId = (created.body as { task: { id: string; termsVersion: string } }).task.id;
      const termsVersion = (created.body as { task: { termsVersion: string } }).task.termsVersion;
      const reserved = await json(baseUrl, `/v1/tasks/${taskId}/funding/reserve`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key("h03-reserve"),
        body: "{}",
      });
      assert.equal(reserved.status, 200);
      const tokenRes = await json(baseUrl, "/v1/contributor-tokens", {
        method: "POST",
        token: OWNER_TOKEN,
        body: JSON.stringify({ contributorPublicId: "h03-contrib", provenance: "test", taskId }),
      });
      const contribToken = (tokenRes.body as { token: string }).token;
      const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: contribToken,
        idempotencyKey: key("h03-claim"),
        body: JSON.stringify({ termsVersion }),
      });
      const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
      const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
        method: "POST",
        token: contribToken,
        idempotencyKey: key("h03-submit"),
        body: JSON.stringify({ reservationId, artifact }),
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

      const locker = new pg.Client({ connectionString: databaseUrl });
      locker.on("error", () => {});
      await locker.connect();
      await locker.query(`SET search_path TO ${quoteIdent(schema)}`);
      await locker.query("BEGIN");
      await locker.query(
        "LOCK TABLE earned_work_tasks, earned_work_reservations, earned_work_verdicts, earned_work_submissions IN ACCESS EXCLUSIVE MODE",
      );
      const verdictKey = key("h03-verdict-inflight");
      const verdictPromise = json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: verdictKey,
        body: JSON.stringify({ reservationId }),
      }).catch((error: unknown) => ({ status: 0, body: { error: String(error) } }));

      const waitDeadline = Date.now() + 8_000;
      let waiter = false;
      while (Date.now() < waitDeadline && !waiter) {
        const rows = await locker.query<{ pid: number }>(
          `SELECT pid FROM pg_stat_activity
           WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'`,
        );
        if (rows.rows[0]) waiter = true;
        else await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(waiter, true, "in-flight verdict waiter was not observed");
      const kernelPid = kernel.pid;
      execFileSync(bin("pg_ctl"), ["-D", pgdata, "-m", "fast", "-w", "stop"], { encoding: "utf8" });
      locker.end().catch(() => {});
      await verdictPromise;
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(kernel.exitCode, null, `kernel exited ${kernel.exitCode} (cce0c4b unhandled Client error)`);
      assert.equal(kernel.pid, kernelPid);

      execFileSync(bin("pg_ctl"), ["-D", pgdata, "-l", pgLog, "-w", "start"], { encoding: "utf8" });
      await waitTcp(pgPort);
      let health = { status: 0, body: {} as unknown };
      for (let i = 0; i < 50 && health.status !== 200; i += 1) {
        try {
          health = await json(baseUrl, "/healthz");
        } catch {
          health = { status: 0, body: {} };
        }
        if (health.status !== 200) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(health.status, 200, JSON.stringify(health.body));
      const replay = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: verdictKey,
        body: JSON.stringify({ reservationId }),
      });
      assert.ok(
        replay.status === 200 || replay.status === 201,
        `${JSON.stringify(replay.body)} kernel=${kernelLog.slice(-2000)}`,
      );
      const inspector = new pg.Client({ connectionString: databaseUrl });
      inspector.on("error", () => {});
      await inspector.connect();
      await inspector.query(`SET search_path TO ${quoteIdent(schema)}`);
      const counted = await inspector.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM earned_work_verdicts WHERE task_id = $1",
        [taskId],
      );
      assert.equal(counted.rows[0]?.n, 1);
      await inspector.end();
    } finally {
      if (kernel && kernel.exitCode == null) {
        kernel.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (kernel.exitCode == null) kernel.kill("SIGKILL");
      }
      try {
        execFileSync(bin("pg_ctl"), ["-D", pgdata, "-m", "fast", "-w", "stop"], { encoding: "utf8" });
      } catch {
        // already stopped
      }
      rmSync(pgdata, { recursive: true, force: true });
      for (const port of FORBIDDEN) {
        const after = await tcpOpen(port);
        assert.equal(after, beforeForbidden[port], `forbidden port ${port} changed`);
      }
    }
  },
);
