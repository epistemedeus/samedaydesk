#!/usr/bin/env node
import { resolve } from "node:path";
import { createPacketServer, listenPacketServer } from "../lib/http.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const packetDir = args.packet || args["out-dir"] || args._[0];
if (!packetDir) {
  process.stderr.write("serve requires --packet <dir>\n");
  process.exit(2);
}

const { server } = createPacketServer({ packetDir: resolve(String(packetDir)) });
const addr = await listenPacketServer(server, {
  host: args.host || "127.0.0.1",
  port: args.port ? Number(args.port) : 0,
});
process.stdout.write(`${JSON.stringify({ ok: true, origin: addr.origin }, null, 2)}\n`);
await new Promise(() => {});
