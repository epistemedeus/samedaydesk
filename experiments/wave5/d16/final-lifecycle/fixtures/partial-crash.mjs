#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--out-dir");
const outDir = i >= 0 ? args[i + 1] : null;
if (!outDir) process.exit(2);
writeFileSync(
  join(outDir, "pin-delta.json"),
  `${JSON.stringify({ ok: true, thisRun: true, generatedAt: new Date().toISOString() }, null, 2)}\n`,
);
process.exit(1);
