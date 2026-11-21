#!/usr/bin/env node
import { frozenClock, systemClock } from "../src/clock.mjs";
import { MonitorError } from "../src/errors.mjs";
import { createMonitor } from "../src/service.mjs";
import { openFileStore } from "../src/store.mjs";

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new MonitorError(`unexpected argument ${token}`, { code: "bad_args" });
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) flags[key] = true;
    else {
      flags[key] = value;
      index += 1;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.state || !flags.subscription) {
    throw new MonitorError("--state and --subscription are required", { code: "bad_args" });
  }
  const clock = flags.now ? frozenClock(flags.now) : systemClock();
  const store = await openFileStore(flags.state);
  const monitor = createMonitor({ store, clock, receivers: {} });
  const rows = await monitor.list(flags.subscription);
  const acknowledgements = [];
  if (flags.ack === true) {
    if (!flags.by || flags.by === true) throw new MonitorError("--by is required with --ack", { code: "bad_args" });
    for (const row of rows) {
      if (row.acknowledgement || row.delivery?.state !== "accepted") continue;
      acknowledgements.push(await monitor.acknowledge({ eventId: row.event.eventId, by: flags.by }));
    }
  }
  const usage = await monitor.usage(flags.subscription);
  process.stdout.write(`${JSON.stringify({
    consumer: "cold",
    subscriptionId: flags.subscription,
    events: rows.map((row) => ({
      eventId: row.event.eventId,
      idempotencyKey: row.event.idempotencyKey,
      transition: row.event.transition,
      evidenceClass: row.event.evidenceClass,
      capture: row.event.capture ?? null,
      task: row.event.task,
      material: row.event.material,
      delivery: row.delivery?.state ?? null,
      delivered: row.delivery?.state === "accepted",
      acknowledgedBy: row.acknowledgement?.acknowledgedBy ?? null,
    })),
    acknowledgements,
    usage,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    error: error instanceof Error ? error.message : "failed",
    code: error instanceof MonitorError ? error.code : "failed",
  })}\n`);
  process.exitCode = 2;
});
