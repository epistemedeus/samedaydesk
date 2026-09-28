#!/usr/bin/env node
import { resolve } from "node:path";
import { CATALOG_PATH, D01_TESTED_SHA, D03_TESTED_SHA } from "../lib/pins.mjs";
import { loadVerifyComplete } from "../lib/d03.mjs";
import { satisfyJob } from "../lib/satisfy.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `w5-d18 contamination harness — stale/foreign/partial sets cannot satisfy another job

Usage:
  node experiments/wave5/d18/bin/contamination.mjs satisfy --root <dir> --job <job-id> \\
    [--inputs-digest <hex>] [--outputs-digest <hex>] [--catalog <catalog.json>]

Exit 0 only when the selected root satisfies the expected job through D03
verifyComplete plus job/input binding. A complete package for a different job,
a stale inputsDigest, or a partial/foreign byte set exits 2.

This command does not run paid jobs. Spawn server/paid-useful-jobs/bin/cli.mjs
for execution. Payments stay non-settling prototypes.

Tested pins: D01 ${D01_TESTED_SHA}
             D03 ${D03_TESTED_SHA}
`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args._[0] === "help" || !args._[0]) {
  process.stdout.write(usage());
  process.exit(args.help || args._[0] === "help" ? 0 : 2);
}

const cmd = args._[0];
if (cmd !== "satisfy") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

if (!args.root || !args.job) {
  process.stderr.write("satisfy requires --root and --job\n");
  process.stdout.write(usage());
  process.exit(2);
}

const loaded = await loadVerifyComplete();
const result = satisfyJob({
  root: resolve(String(args.root)),
  expectedJobId: String(args.job),
  expectedInputsDigest: args["inputs-digest"] ? String(args["inputs-digest"]) : null,
  expectedOutputsDigest: args["outputs-digest"] ? String(args["outputs-digest"]) : null,
  verifyComplete: loaded.verifyComplete,
  catalogPath: args.catalog ? resolve(String(args.catalog)) : CATALOG_PATH,
  evidenceClass: "local-runtime",
});
result.d03Module = loaded.moduleDir;

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
