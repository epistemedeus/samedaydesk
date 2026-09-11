#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { KIND, SELECTED_JOB, contractRecord } from "../lib/contract.mjs";
import { startTrialServer } from "../lib/http.mjs";
import { runFirstExecution, runTrial } from "../lib/trial.mjs";

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
  return `d27-trial — independent Python runtime against the SDS PR52 wrapper CLI

Commands:
  first-execution --buyer-class owner-qa [--out-dir DIR]
  run [job-id] --buyer-class owner-qa --before FILE --after FILE [--out-dir DIR]
  listen [--host 127.0.0.1] [--port 0]
  contract

The Python runtime supplies its own files. SAMPLE/--example is never a sale.
recruited-independent without operator evidence is refused. Demand is not invented.
`;
}

function loadEvidence(path) {
  if (!path) return null;
  return JSON.parse(readFileSync(resolve(String(path)), "utf8"));
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "contract") {
  process.stdout.write(`${JSON.stringify(contractRecord(), null, 2)}\n`);
  process.exit(0);
}

if (cmd === "listen") {
  const started = await startTrialServer({
    host: String(args.host || "127.0.0.1"),
    port: args.port ? Number(args.port) : 0,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, url: started.url, port: started.port, host: started.host })}\n`);
  const stop = () => {
    started.server.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} else if (cmd === "first-execution") {
  const result = runFirstExecution({
    outDir: args["out-dir"] ? resolve(String(args["out-dir"])) : undefined,
    pythonBin: args.python,
    nodeBin: args.node,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 2);
} else if (cmd === "run") {
  const jobId = args._[1] || SELECTED_JOB;
  const inputs = {};
  for (const key of ["before", "after", "used", "input", "next-run", "input-root"]) {
    if (args[key]) inputs[key] = resolve(String(args[key]));
  }
  const result = runTrial({
    jobId,
    inputs,
    example: args.example === true,
    funding: args.funding,
    payment: args.payment ? resolve(String(args.payment)) : undefined,
    buyerClass: args["buyer-class"],
    recruitmentEvidence: loadEvidence(args["recruitment-evidence"]),
    demandClaim: args["demand-claim"] || null,
    outDir: args["out-dir"] ? resolve(String(args["out-dir"])) : undefined,
    pythonBin: args.python,
    nodeBin: args.node,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (args["out-dir"]) {
    writeFileSync(resolve(String(args["out-dir"]), "d27-trial.json"), `${JSON.stringify(result, null, 2)}\n`);
  }
  process.exit(result.kind === KIND.TRANSPORT_FAILURE || result.kind === KIND.HONESTY_REFUSE ? 2 : 0);
} else {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}
