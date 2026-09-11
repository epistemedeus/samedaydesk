#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { startLoopbackReceiver } from "../lib/receiver.mjs";

const args = parse(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`Local loopback test receiver for job-delivery-outbox.
Not a production webhook.

node tools/job-delivery-outbox/bin/loopback-receiver.mjs [--mode ack|close-after-store] [--delay-ms N] [--store-dir DIR] [--port N]
`);
  process.exit(0);
}

if (args.storeDir) mkdirSync(args.storeDir, { recursive: true });
const started = await startLoopbackReceiver({
  mode: args.mode,
  delayMs: args.delayMs,
  storeDir: args.storeDir,
  port: args.port,
});
const info = { ok: true, url: started.url, port: started.port, mode: args.mode, sale: false };
process.stdout.write(`${JSON.stringify(info)}\n`);
if (args.readyFile) writeFileSync(args.readyFile, `${JSON.stringify(info)}\n`);

process.on("SIGTERM", () => started.close().then(() => process.exit(0)));
process.on("SIGINT", () => started.close().then(() => process.exit(0)));

function parse(argv) {
  const out = { mode: "ack", delayMs: 0, port: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--mode") out.mode = argv[++i];
    else if (arg === "--delay-ms") out.delayMs = Number(argv[++i]);
    else if (arg === "--store-dir") out.storeDir = argv[++i];
    else if (arg === "--port") out.port = Number(argv[++i]);
    else if (arg === "--ready-file") out.readyFile = argv[++i];
    else {
      process.stderr.write(`unknown option ${arg}\n`);
      process.exit(2);
    }
  }
  return out;
}
