#!/usr/bin/env node
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runCreateOrder, defaultFileStore } from "../lib/create-order.mjs";
import { createListener } from "../lib/listener.mjs";
import { createPostgresStore } from "../lib/store-postgres.mjs";
import { requestDirFromFile } from "../lib/contract.mjs";
import { OWNED_DIR } from "../lib/pins.mjs";

function usage() {
  return `managed useful-jobs order runner (local prototype, not a live catalog)

Commands:
  create --request order.json [--out-dir DIR] [--store DIR] [--database-url URL]
  listen [--port N] [--store DIR] [--database-url URL]
  help

Binds engineId, archive pin, buyer-echoed input digests, immutable orderId,
and catalog output names. Spawns useful-jobs CLI from the published archive.
Does not POST to samedaydesk.com. Loopback listener only; not a live app route. sold=false.
`;
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] || null;
}

async function makeStore(argv) {
  const databaseUrl = argValue(argv, "--database-url") || process.env.MANAGED_ORDER_DATABASE_URL || null;
  if (databaseUrl) return createPostgresStore({ connectionString: databaseUrl });
  const storeDir = argValue(argv, "--store") || resolve(OWNED_DIR, ".store");
  mkdirSync(storeDir, { recursive: true });
  return defaultFileStore(storeDir);
}

async function cmdCreate(argv) {
  const requestPath = argValue(argv, "--request");
  if (!requestPath) {
    process.stderr.write("create requires --request order.json\n");
    process.stdout.write(usage());
    process.exit(2);
  }
  const abs = resolve(requestPath);
  const raw = JSON.parse(readFileSync(abs, "utf8"));
  const store = await makeStore(argv);
  try {
    const outDir = argValue(argv, "--out-dir");
    const result = await runCreateOrder(raw, {
      store,
      requestDir: requestDirFromFile(abs),
      outDir: outDir ? resolve(outDir) : undefined,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 2);
  } finally {
    await store.close();
  }
}

async function cmdListen(argv) {
  const store = await makeStore(argv);
  const port = Number(argValue(argv, "--port") || 0);
  const listener = createListener({ store, requestDir: process.cwd() });
  const { origin, port: bound } = await listener.listen(Number.isInteger(port) ? port : 0);
  process.stdout.write(
    `${JSON.stringify({ ok: true, origin, port: bound, host: "127.0.0.1", productionExpress: false }, null, 2)}\n`,
  );
  const stop = async () => {
    await listener.close();
    await store.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const argv = process.argv.slice(2);
const cmd = argv[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}
if (cmd === "create") {
  await cmdCreate(argv.slice(1));
} else if (cmd === "listen") {
  await cmdListen(argv.slice(1));
} else {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}
