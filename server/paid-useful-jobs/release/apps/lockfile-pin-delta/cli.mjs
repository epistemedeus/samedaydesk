#!/usr/bin/env node
/**
 * Compatibility entry: spawn the packaged lockfile-pin-delta engine.
 * Does not reimplement pin equality.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BIN = path.join(ROOT, "engines/lockfile-pin-delta/bin/lockfile-delta.mjs");

const r = spawnSync(process.execPath, [BIN, ...process.argv.slice(2)], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
