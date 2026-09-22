#!/usr/bin/env node
/**
 * Maintained-runtime client for the existing useful-jobs offer.
 * Exit 0 only when the offer is named. Explicit failures exit 2.
 */
import { resolve } from "node:path";
import { discoverOffer } from "../src/discover.mjs";
import { fail } from "../src/failures.mjs";

function parseArgs(argv) {
  const args = { mode: "committed", fixturePath: null, pretty: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--committed") args.mode = "committed";
    else if (a === "--live") args.mode = "live";
    else if (a === "--fixture") {
      const pathArg = argv[i + 1];
      if (!pathArg || pathArg.startsWith("-")) {
        return { error: fail("usage", "--fixture requires a path") };
      }
      args.mode = "fixture";
      args.fixturePath = pathArg;
      i += 1;
    } else if (a === "--compact") args.pretty = false;
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      return { error: fail("usage", `unknown argument: ${a}`) };
    }
  }
  if (args.mode === "fixture" && !args.fixturePath) {
    return { error: fail("usage", "--fixture requires a path") };
  }
  if (args.fixturePath) args.fixturePath = resolve(process.cwd(), args.fixturePath);
  return { args };
}

function usage() {
  return `Usage:
  node packs/e4-maintained-runtime-discovery/bin/discover.mjs --committed
  node packs/e4-maintained-runtime-discovery/bin/discover.mjs --live
  node packs/e4-maintained-runtime-discovery/bin/discover.mjs --fixture <path>

Reads existing SameDayDesk useful-jobs surfaces. Does not publish a new
discovery framework. Exit 0 only when the offer is discovered. Empty 2xx
and ok:true-with-no-jobs exit 2 as silent_empty_success.
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

const result = await discoverOffer({
  mode: parsed.args.mode,
  fixturePath: parsed.args.fixturePath,
});
const indent = parsed.args.pretty ? 2 : 0;
process.stdout.write(`${JSON.stringify(result, null, indent)}\n`);
if (result.ok === true && result.offer && result.offer.jobs?.length) process.exit(0);
process.exit(2);
