#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { runCheck, writeReport } from "../lib/check.mjs";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir" && argv[i + 1]) {
      out.outDir = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const result = runCheck();
if (result.incomplete) {
  process.stderr.write(`${JSON.stringify({ ok: false, incomplete: true, error: result.error })}\n`);
  process.exit(1);
}
if (args.outDir) {
  mkdirSync(args.outDir, { recursive: true });
  writeReport(result, args.outDir);
}
process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
process.exit(result.summary.verdict === "INCOMPLETE" ? 1 : 0);
