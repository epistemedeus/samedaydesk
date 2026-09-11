#!/usr/bin/env node
/**
 * Offline paid-offer wrappers around the published useful-jobs engines.
 * Local non-settling envelope. Fixture payments cannot live-settle.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JOB_IDS, JOB_BY_ID } from "../lib/jobs.mjs";
import { runPaidOffer } from "../lib/wrapper.mjs";
import { fixturePaymentTemplate } from "../lib/funding.mjs";

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
  return `paid-useful-jobs — local non-settling wrappers (not live sales)

Commands:
  list
  run <job-id> [inputs] [--example] [--funding unfunded|reserved-fixture] [--payment file.json] [--out-dir dir]

Examples:
  node server/paid-useful-jobs/bin/cli.mjs list
  node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact \\
    --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \\
    --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \\
    --funding reserved-fixture \\
    --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json \\
    --out-dir ./out/paid-vendor-budget

Live settlement is out of scope. SAMPLE/--example is never a paid sale.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "list") {
  process.stdout.write(`${JSON.stringify({ ok: true, jobs: JOB_IDS, liveSettlement: "out-of-scope" }, null, 2)}\n`);
  process.exit(0);
}

if (cmd !== "run") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

const jobId = args._[1];
if (!jobId) {
  process.stderr.write("run requires <job-id>\n");
  process.stdout.write(usage());
  process.exit(2);
}

const job = JOB_BY_ID[jobId];
const inputs = {};
if (job) {
  for (const flag of [...job.requiredInputs, ...(job.optionalInputs || [])]) {
    const key = flag.replace(/^--/, "");
    if (args[key]) inputs[key] = resolve(String(args[key]));
  }
}

let payment = null;
if (args.payment) {
  payment = JSON.parse(readFileSync(resolve(String(args.payment)), "utf8"));
} else if (args.funding === "reserved-fixture") {
  payment = fixturePaymentTemplate();
}

const result = await runPaidOffer({
  jobId,
  inputs,
  example: args.example === true,
  fundingIntent: args.funding || (payment ? "reserved-fixture" : "unfunded"),
  payment,
  settle: args.settle === true,
  outDir: args["out-dir"] ? resolve(String(args["out-dir"])) : undefined,
});

if (args["out-dir"] && result.receipt) {
  mkdirSync(resolve(String(args["out-dir"])), { recursive: true });
  writeFileSync(
    resolve(args["out-dir"], "receipt.json"),
    `${JSON.stringify(result.receipt, null, 2)}\n`,
  );
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
