#!/usr/bin/env node
/**
 * Local, non-hosted ticket desk for the six useful jobs.
 * Persist JSON under --store. Spawn useful-jobs CLI or record a deferred run.
 * sold is always false. No daemon. No Express mount on the live app.
 */
import { resolve } from "node:path";
import { JOB_IDS, flagToKey, getJob } from "../lib/catalog.mjs";
import { openDesk } from "../lib/desk.mjs";

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
  return `job-request-desk — local ticket store for catalog jobs (not a sale)

Commands:
  create <job-id> --store <dir> [--before FILE] [--after FILE] [--used FILE]
                   [--input FILE] [--next-run FILE] [--input-root DIR]
                   [--example] [--defer] [--order-id ID]
  status --store <dir> --request-id <id>
  list   --store <dir> [--engine-id ID]

Examples:
  node tools/job-request-desk/bin/desk.mjs create vendor-budget-impact \\
    --before tools/job-request-desk/fixtures/caller/vendor-budget-impact/before.json \\
    --after tools/job-request-desk/fixtures/caller/vendor-budget-impact/after.json \\
    --store /tmp/job-request-desk

  node tools/job-request-desk/bin/desk.mjs status --store /tmp/job-request-desk --request-id <id>
  node tools/job-request-desk/bin/desk.mjs list --store /tmp/job-request-desk

Jobs: ${JOB_IDS.join(", ")}
sold is always false. SAMPLE/--example becomes status sample, never a sale.
No daemon. Live settlement is out of scope.
`;
}

function collectInputs(job, args) {
  const inputs = {};
  if (!job) return inputs;
  for (const flag of [...job.requiredInputs, ...(job.optionalInputs || [])]) {
    const key = flagToKey(flag);
    if (args[key]) inputs[key] = resolve(String(args[key]));
  }
  return inputs;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (!args.store) {
  process.stderr.write(JSON.stringify({ ok: false, refused: true, code: "missing-store", error: "--store is required", sold: false }) + "\n");
  process.stdout.write(usage());
  process.exit(2);
}

const desk = openDesk(resolve(String(args.store)));

if (cmd === "list") {
  const result = desk.listRequests({ engineId: args["engine-id"] || undefined });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 2);
}

if (cmd === "status") {
  const requestId = args["request-id"] || args._[1];
  if (!requestId) {
    process.stderr.write(JSON.stringify({ ok: false, refused: true, code: "missing-request-id", error: "--request-id is required", sold: false }) + "\n");
    process.exit(2);
  }
  const result = desk.getRequest(requestId);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 2);
}

if (cmd !== "create") {
  process.stderr.write(JSON.stringify({ ok: false, refused: true, code: "unknown-command", error: `unknown command ${cmd}`, sold: false }) + "\n");
  process.stdout.write(usage());
  process.exit(2);
}

const engineId = args["engine-id"] || args._[1];
let job = null;
try {
  job = engineId ? getJob(engineId) : null;
} catch {
  job = null;
}

const result = desk.createRequest({
  engineId,
  inputs: collectInputs(job, args),
  example: args.example === true,
  defer: args.defer === true,
  orderId: args["order-id"] || undefined,
  termsVersion: args["terms-version"],
  sold: args.sold === true,
  settle: args.settle === true,
  outDir: args["out-dir"] ? resolve(String(args["out-dir"])) : undefined,
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
