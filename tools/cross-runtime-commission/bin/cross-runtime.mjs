#!/usr/bin/env node
/**
 * W3-09 E03 — cross-runtime commission scaffold.
 * Records two labelled runtimes against the same listing-repair-packet input.
 * Not a live second-customer purchase. Does not rewrite F08 wrappers.
 */
import { resolve } from "node:path";
import { runFixtureFile, runJourney, writeReport } from "../lib/commission.mjs";
import { DEFAULT_RUNTIMES, JOURNEY_JOB_ID, OWNED_DIR } from "../lib/pins.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
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
  return `cross-runtime-commission — labelled runtime comparison scaffold (not a live sale)

Commands:
  journey --fixture <file.json> [--out report.json]
  help

Literal journey (from this directory):
  node bin/cross-runtime.mjs journey --fixture fixtures/ok.json

Same listing-repair-packet fixture on node22-local vs node22-container-fixture.
independent:true only when environments differ by more than cwd.
SAMPLE is never commissioned customer work. Live extract $0.005 is unchanged.
F08 wrappers, W2-06 cold-start-assessment, and Pilot F11 are not rewritten here.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd !== "journey") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

let result;
if (args.fixture) {
  result = runFixtureFile(String(args.fixture), { cwd: process.cwd() });
} else {
  result = runJourney({
    jobId: JOURNEY_JOB_ID,
    input: resolve(OWNED_DIR, "fixtures/listing/caller-ok.json"),
    runtimes: [...DEFAULT_RUNTIMES],
    cwd: process.cwd(),
  });
}

if (args.out) {
  writeReport(result, resolve(String(args.out)));
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok && !result.refused ? 0 : 2);
