#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { refreshCase } from "../lib/refresh.mjs";

function usage() {
  return `Consumer evidence refresh (F07). Offline. No sale. No public catalog write.

A caller-supplied case must already be redacted. The tool re-runs it against
SDS PR50 evidence packages and writes a new bundle id + digest bound to the
case digest. Original case bytes are not copied into the output.

Usage:
  node tools/consumer-evidence-refresh/bin/refresh.mjs --case <file> --out <file>
  node tools/consumer-evidence-refresh/bin/refresh.mjs --example --out <file>
  node tools/consumer-evidence-refresh/bin/refresh.mjs --help

From this directory:
  node bin/refresh.mjs --case fixtures/customer-owned-redacted.json --out out/refresh.json

SAMPLE / --example cannot become customer_owned: true.
Unknown freshness stays unknown. Not a paid sale or settlement.
`;
}

function parseArgs(argv) {
  const out = {
    casePath: null,
    outPath: null,
    clock: null,
    example: false,
    help: false,
    sold: false,
    settle: false,
    publishCase: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--example") out.example = true;
    else if (arg === "--sold") out.sold = true;
    else if (arg === "--settle") out.settle = true;
    else if (arg === "--case") out.casePath = argv[++i];
    else if (arg === "--out") out.outPath = argv[++i];
    else if (arg === "--clock") out.clock = argv[++i];
    else if (arg === "--publish-case") out.publishCase = argv[++i];
    else throw new Error(`Unknown arg: ${arg}`);
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n${usage()}`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  if (!args.outPath && !args.help) {
    process.stderr.write(`--out is required\n${usage()}`);
    return 2;
  }

  const result = refreshCase({
    casePath: args.casePath,
    outPath: args.outPath,
    clock: args.clock,
    example: args.example,
    sold: args.sold,
    settle: args.settle,
    publishCase: args.publishCase,
  });

  if (!result.ok) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 1;
  }

  const compact = {
    ok: true,
    out: result.outPath,
    bundleId: result.bundle.bundleId,
    digest: result.bundle.digest,
    caseDigest: result.bundle.caseDigest,
    customer_owned: result.customer_owned,
    privateLeak: result.privateLeak,
    freshness: result.bundle.freshness,
    sold: false,
    sample: result.sample,
  };
  process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
  return 0;
}

const invokedAsCli =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().then((code) => process.exit(code));
}
