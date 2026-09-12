#!/usr/bin/env node
/**
 * Thin supplied-input consumer. Spawns each engine's published entrypoint.
 * Does not reimplement lockfile/schema/route/page compare.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const catalog = join(dirname(fileURLToPath(import.meta.url)), "catalog.mjs");
const argv = process.argv.slice(2);
const forwarded = argv[0] === "run" || argv[0] === "invoke" ? argv : ["run", ...argv];
const result = spawnSync(process.execPath, [catalog, ...forwarded], { stdio: "inherit" });
process.exit(result.status ?? 1);
