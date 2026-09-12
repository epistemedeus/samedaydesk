import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { postgresBinaries, startDisposableCluster } from "../lib/pg-cluster.mjs";
import { outboxEventOutcome, OUTCOME } from "../lib/outcomes.mjs";
import { commitThenLose, parseJsonStdout } from "../lib/spawn.mjs";
import { completeF08Job, outbox, runOutbox, spawnReceiver, stopChild, tmp } from "./helpers.mjs";

describe("W5-D20 Postgres outbox interruption", { timeout: 180_000 }, () => {
  it("CLI enqueue and SIGTERM on a real local Postgres store leave unknown after restart", async () => {
    const bins = postgresBinaries();
    assert.equal(
      bins.present,
      true,
      `PostgreSQL binaries missing at initdb=${bins.initdb}. Incomplete coverage, not a skip.`,
    );
    const cluster = startDisposableCluster();
    const job = completeF08Job(tmp("w5d20-f08-pg-"));
    const ready = join(tmp("w5d20-pg-ready-"), "attempt-ready.json");
    const receiver = await spawnReceiver(["--mode", "ack", "--delay-ms", "20000"]);
    try {
      const enqProc = runOutbox([
        "enqueue",
        "--postgres",
        cluster.connectionString,
        "--receipt",
        job.receiptPath,
        "--callback-url",
        receiver.url,
        "--event-id",
        "evt_pg_interrupt",
      ]);
      assert.equal(enqProc.status, 0, enqProc.stderr + enqProc.stdout);
      const enq = parseJsonStdout(enqProc);
      assert.equal(enq.event.deliveryState, "queued");

      const lost = commitThenLose({
        bin: outbox().cli,
        args: [
          "deliver-once",
          "--postgres",
          cluster.connectionString,
          "--event-id",
          "evt_pg_interrupt",
          "--opt-in",
          "--attempt-ready",
          ready,
          "--timeout-ms",
          "25000",
        ],
        cwd: outbox().root,
        commitPath: ready,
        timeoutMs: 20_000,
      });
      assert.equal(lost.stdoutLost, true);

      const statusProc = runOutbox([
        "status",
        "--postgres",
        cluster.connectionString,
        "--event-id",
        "evt_pg_interrupt",
      ]);
      assert.equal(statusProc.status, 0, statusProc.stderr + statusProc.stdout);
      const status = parseJsonStdout(statusProc);
      const outcome = outboxEventOutcome(status.event);
      assert.equal(outcome.class, OUTCOME.TRANSPORT_UNKNOWN);
      assert.equal(status.event.eventId, "evt_pg_interrupt");
      assert.equal(status.event.callbackAcknowledged, false);
      assert.equal(status.event.sold, false);
    } finally {
      stopChild(receiver.child);
      cluster.stop();
    }
  });
});
