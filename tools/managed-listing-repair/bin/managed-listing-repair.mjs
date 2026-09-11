#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runManagedListingRepair } from "../lib/repair.mjs";

function usage() {
  return `Managed listing repair (F05 / W3-11). Offline. Never publishes.

Separates evidence (source observation + digest), suggestion (not a publish),
and authorized publishing. publishAuthorized stays false. SAMPLE packets
cannot become accepted_correction. Reuses PR51 listing-repair-packet.

Usage:
  node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json
  node bin/managed-listing-repair.mjs journey --fixture <file> --out <file>
  node bin/managed-listing-repair.mjs --help

From the repository root:
  node tools/managed-listing-repair/bin/managed-listing-repair.mjs journey \\
    --fixture tools/managed-listing-repair/fixtures/ok.json
`;
}

function parseArgs(argv) {
  const out = {
    command: null,
    fixturePath: null,
    outPath: null,
    example: false,
    help: false,
    publish: false,
    autoPublish: false,
    publishAuthorized: false,
    acceptedCorrection: false,
    editF08: false,
    writeF08: false,
    f08Path: null,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) {
    out.command = rest.shift();
  }
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--example") out.example = true;
    else if (arg === "--publish" || arg === "--auto-publish") {
      out.publish = true;
      out.autoPublish = true;
    } else if (arg === "--publish-authorized") out.publishAuthorized = true;
    else if (arg === "--accepted-correction") out.acceptedCorrection = true;
    else if (arg === "--write-f08") out.editF08 = true;
    else if (arg === "--fixture") out.fixturePath = rest[++i];
    else if (arg === "--out") out.outPath = rest[++i];
    else if (arg === "--f08-path") out.f08Path = rest[++i];
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
  if (args.command && args.command !== "journey") {
    process.stderr.write(`Unknown command ${args.command}\n${usage()}`);
    return 2;
  }

  const result = runManagedListingRepair({
    fixturePath: args.fixturePath,
    outPath: args.outPath,
    example: args.example,
    publish: args.publish,
    autoPublish: args.autoPublish,
    publishAuthorized: args.publishAuthorized,
    acceptedCorrection: args.acceptedCorrection,
    editF08: args.editF08,
    writeF08: args.writeF08,
    f08Path: args.f08Path,
  });

  if (!result.ok) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 1;
  }

  const compact = {
    ok: true,
    schema: result.schema,
    evidence: result.evidence,
    suggestion: result.suggestion,
    publishAuthorized: false,
    accepted_correction: false,
    sold: false,
    out: result.outPath,
  };
  process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
  return 0;
}

const invokedAsCli =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().then((code) => process.exit(code));
}
