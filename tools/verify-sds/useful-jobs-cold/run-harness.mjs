#!/usr/bin/env node
/**
 * Cold harness entry: acquire exit 0; seeded wrong-sha/wrong-bytes exit ≠ 0.
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
});

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status == null ? 64 : result.status);
