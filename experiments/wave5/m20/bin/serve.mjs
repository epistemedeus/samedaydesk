#!/usr/bin/env node
import { listenReadoutServer } from "../lib/http.mjs";

function parseArgs(argv) {
  const out = { host: "127.0.0.1", port: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argFlag(argv[i], "host")) {
      out.host = argv[i + 1];
      i += 1;
    } else if (argFlag(argv[i], "port")) {
      out.port = Number(argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

function argFlag(arg, name) {
  return arg === `--${name}`;
}

const args = parseArgs(process.argv.slice(2));
const listening = await listenReadoutServer(args);
process.stdout.write(
  `${JSON.stringify({ ok: true, host: listening.host, port: listening.port, contract: "samedaydesk.wave5.m20.readout.v1" }, null, 2)}\n`,
);
