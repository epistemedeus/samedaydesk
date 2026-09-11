#!/usr/bin/env node
/**
 * Mailbox/archive consumer: bind a selected root and accept only a complete
 * receipt-bound useful-job result. Local non-settling prototype. Never follows
 * paths outside the selected root.
 */
import { resolve } from "node:path";
import { CATALOG_PATH } from "../lib/pins.mjs";
import { verifyComplete } from "../lib/verify.mjs";

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
  return `job-output-atomicity verify-complete — mailbox/archive consumer

Usage:
  node tools/job-output-atomicity/bin/verify-complete.mjs --root <dir> [--receipt receipt.json] [--catalog <catalog.json>]

Binds every output name to the selected root. Relative receipt paths that
escape the root are rejected. Absolute producer paths are not read; files are
resolved by basename under --root (F08 stamps absolute outDir).

Exit 0 only for classification=complete. Payments are non-settling prototypes.
`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args._[0] === "help") {
  process.stdout.write(usage());
  process.exit(0);
}

const cmd = args._[0];
if (cmd && cmd !== "verify-complete" && cmd !== "verify") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

if (!args.root) {
  process.stderr.write("verify-complete requires --root\n");
  process.stdout.write(usage());
  process.exit(2);
}

const result = verifyComplete({
  root: resolve(String(args.root)),
  receiptName: args.receipt ? String(args.receipt) : "receipt.json",
  catalogPath: args.catalog ? resolve(String(args.catalog)) : CATALOG_PATH,
  evidenceClass: "local-runtime",
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
