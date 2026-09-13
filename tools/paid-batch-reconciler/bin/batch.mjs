#!/usr/bin/env node
/**
 * Fixture paid-batch reconciler. Local, non-settling. sold is always false.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runBatch } from "../lib/ledger.mjs";
import { createPaidBatchServer, listenLocal } from "../lib/http.mjs";
import { JOB_IDS } from "../lib/catalog.mjs";
import { REQUEST_SCHEMA } from "../lib/pins.mjs";
import { requestBaseDirFromPath } from "../lib/request.mjs";

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

function usage() {
  return `paid-batch-reconciler — fixture batch ledger (not live sales)

Consumes the current repository execution.v1 core through the durable request desk.

Commands:
  run <request.json> [--store dir] [--out-dir dir]
  serve --store DIR [--host 127.0.0.1] [--port 0]
  list

Request JSON:
  { "schema": "${REQUEST_SCHEMA}", "items": [
      { "id": "item-a", "engineId": "vendor-budget-impact", "files": { "before": "...", "after": "..." },
        "funding": "reserved-fixture", "payment": "fixtures/payment/reserved-fixture.json" }
    ] }

Duplicate or traversing item ids/paths are refused. reserved-fixture requires a payment object.
Live settlement is out of scope. SAMPLE is never a paid sale. sold stays false.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "list") {
  process.stdout.write(
    `${JSON.stringify({ ok: true, engines: JOB_IDS, sold: false, liveSettlement: "out-of-scope" }, null, 2)}\n`,
  );
  process.exit(0);
}

if (cmd === "serve") {
  const host = args.host || "127.0.0.1";
  const port = args.port ? Number(args.port) : 0;
  const { server } = createPaidBatchServer({ baseDir: process.cwd(), storeDir: args.store });
  const info = await listenLocal(server, { host, port });
  process.stdout.write(
    `${JSON.stringify({ ok: true, url: info.url, sold: false, liveSettlement: "out-of-scope" }, null, 2)}\n`,
  );
  process.stderr.write(`listening ${info.url} (local fixture ledger; not a live payment server)\n`);
} else if (cmd === "run") {
  const file = args._[1];
  if (!file) {
    process.stderr.write("run requires <request.json>\n");
    process.stdout.write(usage());
    process.exit(2);
  }
  const abs = resolve(file);
  const raw = JSON.parse(readFileSync(abs, "utf8"));
  const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : undefined;
  const ledger = await runBatch(raw, {
    baseDir: requestBaseDirFromPath(abs),
    outDir,
    persistKind: "cli",
    storeDir: args.store,
  });
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(ledger, null, 2)}\n`);
  process.exit(ledger.ok === true ? 0 : 2);
} else {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}
