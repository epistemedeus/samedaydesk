#!/usr/bin/env node
// Writes generated/ from the manifest. --check exits 1 when a file differs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED } from "../src/generate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const check = process.argv.includes("--check");
const drift = [];
for (const [path, build] of Object.entries(GENERATED)) {
  const target = join(root, path);
  const text = build(version);
  if (check) { if (!existsSync(target) || readFileSync(target, "utf8") !== text) drift.push(path); continue; }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}
process.stdout.write(`${JSON.stringify({ schema: "samedaydesk.cli.generate.v1", ok: drift.length === 0, check, files: Object.keys(GENERATED), drift })}\n`);
process.exitCode = drift.length ? 1 : 0;
