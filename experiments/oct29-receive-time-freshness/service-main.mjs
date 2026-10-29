import { writeSync } from "node:fs";
import express from "express";
import { mountManagedWatch } from "../../server/lib/managed-watch/http.mjs";
import { readPinnedSnapshot } from "../../server/lib/managed-watch/source.mjs";
import { fetchPinnedThrough, publicLookup, readClockInstant, readModeFile } from "./source-server.mjs";

const clockFile = process.env.CLOCK_FILE;
const modeFile = process.env.MODE_FILE;
const sourcePort = Number(process.env.SOURCE_PORT);
if (!clockFile || !modeFile || !Number.isInteger(sourcePort)) {
  process.stderr.write("CLOCK_FILE, MODE_FILE, and SOURCE_PORT are required\n");
  process.exit(1);
}

const app = express();
const handle = mountManagedWatch(app, {
  enabled: true,
  env: process.env,
  now: () => readClockInstant(clockFile),
  readSource: async (args) => readPinnedSnapshot({
    timeoutMs: args.timeoutMs,
    maxBodyBytes: args.maxBodyBytes,
    signal: args.signal,
    now: args.now,
    lookup: publicLookup,
    fetchImpl: (url, init) => {
      const pending = fetchPinnedThrough(url, init, {
        port: sourcePort,
        mode: readModeFile(modeFile),
      });
      if (process.env.CRASH_DURING === "1") {
        setTimeout(() => process.kill(process.pid, "SIGKILL"), 80);
      }
      return pending;
    },
  }),
  hooks: {
    afterFetched() {
      if (process.env.CRASH_AFTER === "fetched") process.kill(process.pid, "SIGKILL");
    },
  },
});

const server = app.listen(0, "127.0.0.1", () => {
  writeSync(1, `READY ${server.address().port}\n`);
});

function shutdown() {
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  server.close(() => {
    handle.close().then(() => process.exit(0), () => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
