#!/usr/bin/env node
/**
 * Local supplied-input delivery kit. Not a payment server or live deploy.
 */
import { resolve } from "node:path";
import { deliverDisjointSecondJob, deliverSuppliedInput } from "../lib/delivery-kit.mjs";
import { FIRST_OFFER } from "../lib/delivery-catalog.mjs";

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

Recommended first offer (npm package-lock v2/v3 JSON):

node server/paid-useful-jobs/bin/deliver.mjs \\
  --job lockfile-pin-delta \\
  --before "$BEFORE_LOCKFILE" \\
  --after "$AFTER_LOCKFILE"

Accepted lockfile inputs: npm package-lock.json lockfileVersion 2 or 3.
Not yarn.lock, pnpm-lock.yaml, bun.lock, package.json-only, or HTML.

Other selectable engines: json-schema-webhook-drift (--before --after --used),
route-table-diff (--before --after), page-change-offline-job (--job-file).
Published useful-jobs (vendor-budget-impact and the other five) stay selectable.

Options:
  --second-after FILE   run a disjoint second job with the same before file
  --http                 mount loopback execution.v1 HTTP for the first job
  --mailbox DIR          mailbox root
  --out-dir DIR          published copy (not receipt authority)
  --job-file FILE        page-change job document (inputs.job)
`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args._[0] === "help") {
  process.stdout.write(usage());
  process.exit(0);
}

const jobId = args.job || args._[0] || FIRST_OFFER;
const inputs = {};
if (args.before) inputs.before = resolve(String(args.before));
if (args.after) inputs.after = resolve(String(args.after));
if (args.used) inputs.used = resolve(String(args.used));
if (args.input) inputs.input = resolve(String(args.input));
if (args["next-run"]) inputs["next-run"] = resolve(String(args["next-run"]));
if (args["input-root"]) inputs["input-root"] = resolve(String(args["input-root"]));
if (args["job-file"] || args["job-json"]) {
  inputs.job = resolve(String(args["job-file"] || args["job-json"]));
}

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
    before: inputs.before,
    after: resolve(String(args["second-after"])),
  });
} else {
  result = await deliverSuppliedInput(common);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
