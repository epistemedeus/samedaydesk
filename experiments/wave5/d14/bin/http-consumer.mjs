#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ConsumerRefuse, assertNoFilesystemPaths, encodeExecuteRequest } from "../lib/encode-inputs.mjs";
import { getHealth, getResult, postExecute, ticketFromSubmit } from "../lib/client.mjs";
import { EXECUTION_CONTRACT_VERSION } from "../lib/pins.mjs";

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
  return `w5-d14 thin HTTP consumer of D01 execution.v1. Not a second server.

Commands:
  health --base URL
  submit --base URL --job <job-id> [--before file] [--after file] [--input file] [--used file]
         [--next-run file] [--funding unfunded|reserved-fixture] [--payment file.json]
         [--example] --ticket ticket.json
  fetch --ticket ticket.json [--base URL] --out result.json

submit reads caller files and POSTs their JSON bytes to POST /execute.
It does not send filesystem paths and does not run the useful-jobs engine.
fetch is a separate process that GET /results/:id.

Start D01 loopback first:
  node server/paid-useful-jobs/bin/serve-execution.mjs
`;
}

function writeJson(filePath, value) {
  mkdirSync(dirname(resolve(filePath)), { recursive: true });
  writeFileSync(resolve(filePath), `${JSON.stringify(value, null, 2)}\n`);
}

function exitForClassify(classify, okFlag) {
  if (classify.kind === "http-transport-failure") return 3;
  if (classify.kind === "execution-transport-failure") return 2;
  if (okFlag === true) return 0;
  return 2;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

try {
  if (cmd === "health") {
    if (!args.base) throw new ConsumerRefuse("missing-base", "--base URL is required");
    const result = await getHealth(String(args.base));
    process.stdout.write(`${JSON.stringify({ ...result, contract: EXECUTION_CONTRACT_VERSION }, null, 2)}\n`);
    process.exit(result.classify.kind === "http-transport-failure" || result.status !== 200 ? 2 : 0);
  }

  if (cmd === "submit") {
    if (!args.base) throw new ConsumerRefuse("missing-base", "--base URL is required");
    if (!args.ticket) throw new ConsumerRefuse("missing-ticket", "--ticket file is required");
    const jobId = args.job || args._[1];
    const files = {};
    for (const key of ["before", "after", "input", "used", "next-run"]) {
      if (args[key]) files[key] = resolve(String(args[key]));
    }
    let payment = null;
    if (args.payment) {
      payment = JSON.parse(readFileSync(resolve(String(args.payment)), "utf8"));
    }
    const { request, submitted } = encodeExecuteRequest({
      jobId,
      files,
      fundingIntent: args.funding ? String(args.funding) : undefined,
      payment,
      example: args.example === true,
    });
    assertNoFilesystemPaths(request, Object.values(files));
    const posted = await postExecute(String(args.base), request);
    const ticket = ticketFromSubmit({
      origin: String(args.base),
      request,
      submitted,
      posted,
    });
    writeJson(String(args.ticket), ticket);
    process.stdout.write(`${JSON.stringify({ ok: posted.body?.ok === true, ticket, classify: posted.classify }, null, 2)}\n`);
    process.exit(exitForClassify(posted.classify, posted.body?.ok));
  }

  if (cmd === "fetch") {
    if (!args.ticket) throw new ConsumerRefuse("missing-ticket", "--ticket file is required");
    if (!args.out) throw new ConsumerRefuse("missing-out", "--out file is required");
    const ticket = JSON.parse(readFileSync(resolve(String(args.ticket)), "utf8"));
    const origin = args.base ? String(args.base) : ticket.origin;
    if (!origin) throw new ConsumerRefuse("missing-base", "ticket.origin or --base is required");
    const path = ticket.retrieval?.path;
    if (!path) throw new ConsumerRefuse("missing-retrieval", "ticket.retrieval.path is required");
    const got = await getResult(origin, path);
    const result = {
      contract: got.body?.contract || ticket.contract || EXECUTION_CONTRACT_VERSION,
      origin,
      retrieval: ticket.retrieval,
      submitted: ticket.submitted,
      classify: got.classify,
      httpStatus: got.status,
      result: got.body,
    };
    writeJson(String(args.out), result);
    process.stdout.write(`${JSON.stringify({ ok: got.body?.ok === true, classify: got.classify, executionId: got.body?.executionId || null }, null, 2)}\n`);
    process.exit(exitForClassify(got.classify, got.body?.ok));
  }

  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
} catch (err) {
  const code = err instanceof ConsumerRefuse ? err.code : "internal-error";
  process.stdout.write(
    `${JSON.stringify({ ok: false, code, error: err.message, detail: err.detail || null }, null, 2)}\n`,
  );
  process.exit(err instanceof ConsumerRefuse ? 2 : 1);
}
