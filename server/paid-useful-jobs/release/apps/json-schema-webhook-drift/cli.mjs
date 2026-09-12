#!/usr/bin/env node
/**
 * Compatibility entry: spawn the packaged json-schema-webhook-drift engine.
 * Not OpenAPI. Does not reimplement used-pointer comparison.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BIN = path.join(ROOT, "engines/json-schema-webhook-drift/bin/webhook-drift.mjs");

const r = spawnSync(process.execPath, [BIN, ...process.argv.slice(2)], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
