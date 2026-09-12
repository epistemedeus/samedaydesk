#!/usr/bin/env node
/**
 * Compatibility entry: spawn the packaged route-table-diff engine.
 * Does not edit spa-route-shells or homepages.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BIN = path.join(ROOT, "engines/route-table-diff/bin/route-diff.mjs");

const r = spawnSync(process.execPath, [BIN, ...process.argv.slice(2)], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
