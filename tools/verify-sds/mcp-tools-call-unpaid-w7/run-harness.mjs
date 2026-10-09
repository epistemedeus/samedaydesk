#!/usr/bin/env node
/**
 * Cold harness entry: unpaid tools/call → isError exit 0; seeded paid refuses exit ≠ 0.
 * Invokes cli.mjs run so a single command proves acceptance.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");

const result = spawnSync(process.execPath, [cli, "run", "--json"], {
  encoding: "utf8",
  cwd: join(here, "../../.."),
  env: process.env,
  timeout: 30_000,
});

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status == null ? 64 : result.status);
