#!/usr/bin/env node
/**
 * Compatibility entry: spawn the packaged page-change-offline-job engine.
 * `--example` is refused (not a delivered watch). Default subcommand is `job`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BIN = path.join(ROOT, "engines/page-change-offline-job/bin/page-change.mjs");

const argv = process.argv.slice(2);
const first = argv[0];
const known = new Set(["job", "compare", "journey", "--help", "-h"]);
const forwarded = first && known.has(first) ? argv : ["job", ...argv];

const r = spawnSync(process.execPath, [BIN, ...forwarded], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
