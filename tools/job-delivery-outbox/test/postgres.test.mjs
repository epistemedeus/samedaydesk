import assert from "node:assert/strict";
import { existsSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import test from "node:test";
import { createPostgresStore } from "../lib/store-postgres.mjs";
import { enqueue, deliverOnce, status } from "../lib/outbox.mjs";
import { completedCallerReceipt, spawnReceiver, stopChild, tmpSpace } from "./helpers.mjs";

const PG_BIN = process.env.OUTBOX_PG_BIN || "/usr/lib/postgresql/16/bin";
const INITDB = join(PG_BIN, "initdb");
const PG_CTL = join(PG_BIN, "pg_ctl");

function pgAvailable() {
  return existsSync(INITDB) && existsSync(PG_CTL);
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
}

function startDisposableCluster() {
  const dir = mkdtempSync(join(tmpdir(), "outbox-pg-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 55000 + Math.floor(Math.random() * 4000);
  const logFile = join(dir, "pg.log");
  const init = run(INITDB, ["-D", pgdata, "-U", "outbox", "--auth-local=trust", "--auth-host=trust"]);
  assert.equal(init.status, 0, init.stderr || init.stdout);
  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nunix_socket_directories = '${socketDir}'\nlisten_addresses = ''\n`,
  );
  const start = run(PG_CTL, ["-D", pgdata, "-l", logFile, "start", "-w"]);
  assert.equal(start.status, 0, start.stderr || start.stdout);
  return {
    dir,
    pgdata,
    socketDir,
    port,
    stop() {
      run(PG_CTL, ["-D", pgdata, "stop", "-m", "fast"]);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("local-runtime postgres: enqueue, loopback ack, reopen client, one acknowledged event", { timeout: 90_000 }, async () => {
  if (!pgAvailable()) {
    throw new Error("PostgreSQL 16 initdb/pg_ctl required at /usr/lib/postgresql/16/bin; missing binaries mean incomplete coverage");
  }
  const cluster = startDisposableCluster();
  const dir = tmpSpace("outbox-pg-j-");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiver = await spawnReceiver(["--mode", "ack"]);
  const pgConfig = {
    host: cluster.socketDir,
    port: cluster.port,
    user: "outbox",
    database: "postgres",
  };
  try {
    const store = await createPostgresStore({ config: pgConfig });
    await store.init();
    const enq = await enqueue(store, { receipt, callbackUrl: receiver.url });
    assert.equal(enq.ok, true);
    assert.equal(enq.event.deliveryState, "queued");
    assert.equal(enq.event.callbackDestination.path, "/callback");
    const delivered = await deliverOnce(store, { eventId: enq.event.eventId, optIn: true });
    assert.equal(delivered.event.deliveryState, "delivered");
    assert.equal(delivered.event.buyerAccepted, false);
    assert.equal(delivered.event.sale, false);
    await store.close();

    const store2 = await createPostgresStore({ config: pgConfig });
    await store2.init();
    const again = await status(store2, { eventId: enq.event.eventId });
    assert.equal(again.event.eventId, enq.event.eventId);
    assert.equal(again.event.deliveryState, "delivered");
    assert.equal(again.event.sale, false);
    await store2.close();
  } finally {
    stopChild(receiver.child);
    cluster.stop();
  }
});
