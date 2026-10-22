#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.W5_A2A_STATE_DIR;
const mode = process.env.W5_A2A_MODE || "long";
const longMs = Number(process.env.W5_A2A_LONG_MS || 20000);
const shortMs = Number(process.env.W5_A2A_SHORT_MS || 400);
if (!dir) {
  process.stderr.write("W5_A2A_STATE_DIR required\n");
  process.exit(2);
}

writeFileSync(join(dir, "pid"), String(process.pid));
writeFileSync(join(dir, "started"), new Date().toISOString());
let ticks = 0;
const started = Date.now();
const limit = mode === "short" ? shortMs : longMs;

const timer = setInterval(() => {
  ticks += 1;
  writeFileSync(
    join(dir, "heartbeat"),
    JSON.stringify({ ticks, at: new Date().toISOString(), pid: process.pid }),
  );
  if (Date.now() - started >= limit) {
    finish("timeout");
  }
}, 100);

function finish(reason) {
  clearInterval(timer);
  writeFileSync(
    join(dir, "exit"),
    JSON.stringify({
      reason,
      ticks,
      pid: process.pid,
      at: new Date().toISOString(),
    }),
  );
  process.exit(0);
}

process.on("SIGTERM", () => finish("SIGTERM"));
process.on("SIGINT", () => finish("SIGINT"));
