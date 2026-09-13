#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { OutboxRefuse } from "./errors.mjs";
import { createFileStore } from "./store-file.mjs";
import { createPostgresStore } from "./store-postgres.mjs";
import { enqueue, deliverOnce, status, reconcile } from "./outbox.mjs";

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.command) {
    process.stdout.write(`${usage()}\n`);
    process.exit(args.help ? 0 : 2);
  }

  const store = await openStore(args);
  let exitCode = 0;
  try {
    await store.init();
    const result = await runCommand(store, args);
    process.stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
  } catch (err) {
    const body = {
      ok: false,
      code: err.code || "error",
      error: err.message,
      detail: err.detail || null,
      sold: false,
      sale: false,
      buyerAccepted: false,
    };
    process.stdout.write(`${JSON.stringify(body)}\n`);
    exitCode = err instanceof OutboxRefuse ? 2 : 1;
  } finally {
    await store.close();
  }
  if (exitCode) process.exit(exitCode);
}

async function runCommand(store, args) {
  if (args.command === "enqueue") {
    if (!args.receipt) refuseArg("--receipt is required");
    const receipt = readJson(args.receipt);
    return enqueue(store, {
      receipt,
      callbackUrl: args.callbackUrl,
      eventId: args.eventId,
      zip: args.zip, zipSha256: args.zipSha256,
    });
  }
  if (args.command === "deliver-once") {
    if (!args.eventId) refuseArg("--event-id is required");
    return deliverOnce(store, {
      eventId: args.eventId,
      optIn: args.optIn === true,
      attemptReadyPath: args.attemptReady,
      timeoutMs: args.timeoutMs,
    });
  }
  if (args.command === "status") {
    return status(store, { eventId: args.eventId });
  }
  if (args.command === "reconcile") {
    return reconcile(store);
  }
  refuseArg(`unknown command ${args.command}`);
}

async function openStore(args) {
  if (args.postgres) {
    return createPostgresStore({ connectionString: args.postgres });
  }
  return createFileStore(args.store);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function refuseArg(message) {
  const err = new OutboxRefuse("usage", message);
  throw err;
}

function parseArgs(argv) {
  const out = { command: argv[0], optIn: false, pretty: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--opt-in") out.optIn = true;
    else if (arg === "--pretty") out.pretty = true;
    else if (arg === "--store") out.store = need(argv, ++i, "--store");
    else if (arg === "--postgres") out.postgres = need(argv, ++i, "--postgres");
    else if (arg === "--zip") out.zip = need(argv, ++i, "--zip");
    else if (arg === "--zip-sha256") out.zipSha256 = need(argv, ++i, "--zip-sha256");
    else if (arg === "--receipt") out.receipt = need(argv, ++i, "--receipt");
    else if (arg === "--callback-url") out.callbackUrl = need(argv, ++i, "--callback-url");
    else if (arg === "--event-id") out.eventId = need(argv, ++i, "--event-id");
    else if (arg === "--attempt-ready") out.attemptReady = need(argv, ++i, "--attempt-ready");
    else if (arg === "--timeout-ms") out.timeoutMs = Number(need(argv, ++i, "--timeout-ms"));
    else refuseArg(`unknown option ${arg}`);
  }
  return out;
}

function need(argv, i, name) {
  if (i >= argv.length) refuseArg(`${name} requires a value`);
  return argv[i];
}

function usage() {
  return `Crash-safe local job-result delivery outbox.
Non-settling prototype. Default: no network. Loopback HTTP only. No daemon.

Commands:
  enqueue --store <dir> --receipt <receipt.json> --callback-url http://127.0.0.1:<port>/callback [--event-id <id>]
  deliver-once --store <dir> --event-id <id> --opt-in [--attempt-ready <file>]
  status --store <dir> [--event-id <id>]
  reconcile --store <dir>

Optional Postgres (local prototype, not a payment rail):
  --postgres postgres://USER@127.0.0.1:PORT/DB

Callback ack is not buyer acceptance or a sale. SAMPLE remains SAMPLE.
Destination identity is origin plus path. Ack must bind eventId, path, and outputs digest.
Unknown HTTP outcomes stay unknown; deliver-once will not auto-POST them.`;
}

const invoked = process.argv[1] && process.argv[1].endsWith("cli.mjs");
if (invoked) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
