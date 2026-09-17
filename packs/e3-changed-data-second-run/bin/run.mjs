#!/usr/bin/env node
/**
 * Actual caller of page-change-offline-job with a labelled second run.
 * Exit 0 only when both runs complete and labels are honest.
 * Same fixture twice labelled as repeat demand exits 2.
 */
import { resolve } from "node:path";
import { fail } from "../src/failures.mjs";
import { pairPathForMode, runChangedDataPair } from "../src/run.mjs";

function takePath(argv, i, flag) {
  const value = argv[i + 1];
  if (value == null || value.startsWith("--")) {
    return { error: fail("usage", `${flag} requires a path`) };
  }
  return { value, next: i + 1 };
}

function parseArgs(argv) {
  const args = {
    mode: "owner-qa-vs-independent",
    pairPath: null,
    outDir: null,
    pretty: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--owner-qa-vs-independent") args.mode = "owner-qa-vs-independent";
    else if (a === "--owner-qa") args.mode = "owner-qa";
    else if (a === "--seeded-fixture") args.mode = "seeded-fixture";
    else if (a === "--pair") {
      const taken = takePath(argv, i, "--pair");
      if (taken.error) return { error: taken.error };
      args.mode = "pair";
      args.pairPath = taken.value;
      i = taken.next;
    } else if (a === "--out-dir") {
      const taken = takePath(argv, i, "--out-dir");
      if (taken.error) return { error: taken.error };
      args.outDir = taken.value;
      i = taken.next;
    } else if (a === "--compact") args.pretty = false;
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      return { error: fail("usage", `unknown argument: ${a}`) };
    }
  }
  if (args.mode === "pair" && !args.pairPath) {
    return { error: fail("usage", "--pair requires a path") };
  }
  if (args.pairPath) args.pairPath = resolve(process.cwd(), args.pairPath);
  if (args.outDir) args.outDir = resolve(process.cwd(), args.outDir);
  return { args };
}

function usage() {
  return `Usage:
  node packs/e3-changed-data-second-run/bin/run.mjs --owner-qa-vs-independent
  node packs/e3-changed-data-second-run/bin/run.mjs --owner-qa
  node packs/e3-changed-data-second-run/bin/run.mjs --pair <path>
  node packs/e3-changed-data-second-run/bin/run.mjs --seeded-fixture

Spawns the existing useful-jobs page-change-offline-job twice. Second run
requires changed input. Owner QA vs independent stay labelled. Same fixture
twice labelled as repeat demand exits 2.
`;
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  process.stdout.write(`${JSON.stringify(parsed.error, null, 2)}\n`);
  process.exit(2);
}
if (parsed.args.help) {
  process.stderr.write(usage());
  process.exit(0);
}

const pairPath = pairPathForMode(parsed.args.mode, parsed.args.pairPath);
if (!pairPath) {
  const error = fail("usage", "could not resolve pair path");
  process.stdout.write(`${JSON.stringify(error, null, 2)}\n`);
  process.exit(2);
}

const result = runChangedDataPair({
  pairPath,
  outDir: parsed.args.outDir,
});
const indent = parsed.args.pretty ? 2 : 0;
process.stdout.write(`${JSON.stringify(result, null, indent)}\n`);
if (result.ok === true && result.changedInput === true && result.secondRun === true && result.repeatDemand === false) {
  process.exit(0);
}
process.exit(2);
