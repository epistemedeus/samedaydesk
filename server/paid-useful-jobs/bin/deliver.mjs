#!/usr/bin/env node
/**
 * Local supplied-input delivery kit. Not a payment server or live deploy.
 */
import { resolve } from "node:path";
import { deliverDisjointSecondJob, deliverSuppliedInput } from "../lib/delivery-kit.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";

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
  return `paid-useful-jobs delivery kit — preflight → order → execute → completeness → mailbox

node server/paid-useful-jobs/bin/deliver.mjs \\
  --job vendor-budget-impact \\
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \\
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json

Options:
  --second-after FILE   run a disjoint second job with the same before file
  --http                 mount loopback execution.v1 HTTP for the first job
  --mailbox DIR          mailbox root
  --out-dir DIR          published copy (not receipt authority)
`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args._[0] === "help") {
  process.stdout.write(usage());
  process.exit(0);
}

const jobId = args.job || args._[0] || "vendor-budget-impact";
const before = args.before ? resolve(String(args.before)) : joinDefault("before.json");
const after = args.after ? resolve(String(args.after)) : joinDefault("after.json");

function joinDefault(name) {
  return resolve(
    REPO_ROOT,
    "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact",
    name,
  );
}

const inputs = { before, after };
if (args.used) inputs.used = resolve(String(args.used));
if (args.input) inputs.input = resolve(String(args.input));

const common = {
  jobId,
  inputs,
  http: args.http === true,
  mailbox: args.mailbox ? resolve(String(args.mailbox)) : undefined,
  publishedDir: args["out-dir"] ? resolve(String(args["out-dir"])) : undefined,
};

let result;
if (args["second-after"]) {
  result = await deliverDisjointSecondJob(common, {
    before,
    after: resolve(String(args["second-after"])),
  });
} else {
  result = await deliverSuppliedInput(common);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
