#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConsumerRefuse, assertNoFilesystemPaths, encodeExecuteRequest } from "../lib/encode-inputs.mjs";
import { getHealth, getResult, postExecute } from "../lib/client.mjs";
import { createTicket, readTicket, updateTicketAfterPost, writeTicketAtomic } from "../lib/ticket.mjs";
import { verifyTicketBoundResult } from "../lib/verify.mjs";
import { acquireLocalArtifacts, portableAcquisitionUnsupported } from "../lib/acquire.mjs";
import { EXECUTION_CONTRACT_VERSION } from "../lib/pins.mjs";
import { assertExecutionId, originsEqual, parseHttpOrigin } from "../lib/origin.mjs";

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
  return `w5-d14 thin HTTP consumer of execution.v1. Not a second server.

Commands:
  health --base URL
  submit --base URL --job <job-id> [--execution-id ID] [--before file] [--after file] [--input file] [--used file]
         [--next-run file] [--funding unfunded|reserved-fixture] [--payment file.json]
         [--example] --ticket ticket.json
  fetch --ticket ticket.json [--base URL] --out result.json
        [--local-artifacts DIR --acquire-to DIR]

submit reads caller UTF-8 JSON once, chooses/validates executionId, persists the
ticket atomically, then POSTs /execute. Retrieval identity does not come from the
POST response. fetch GETs /results/:id from the ticket origin only.

HTTP output path fields are host paths, not acquisition authority. Without
--local-artifacts, fetch surfaces unsupported-portable-acquisition and never
treats engine HTTP summaries as artifact files. httpArtifactsDelivered stays false.

Start the in-tree loopback (not a new server):
  node server/paid-useful-jobs/bin/serve-execution.mjs
`;
}

function exitForClassify(classify) {
  if (classify?.kind === "http-transport-failure") return 3;
  if (classify?.kind === "execution-transport-failure") return 2;
  if (classify?.kind === "analysis-outcome" && classify.ok === true) return 0;
  return 2;
}

function timeoutMs(fallback) {
  const raw = process.env.D14_TIMEOUT_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
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
    const origin = parseHttpOrigin(String(args.base)).origin;
    const result = await getHealth(origin, { timeoutMs: timeoutMs(15_000) });
    process.stdout.write(`${JSON.stringify({ ...result, contract: EXECUTION_CONTRACT_VERSION }, null, 2)}\n`);
    process.exit(result.classify.kind === "http-transport-failure" || result.status !== 200 ? 2 : 0);
  }

  if (cmd === "submit") {
    if (!args.base) throw new ConsumerRefuse("missing-base", "--base URL is required");
    if (!args.ticket) throw new ConsumerRefuse("missing-ticket", "--ticket file is required");
    const origin = parseHttpOrigin(String(args.base)).origin;
    const ticketPath = resolve(String(args.ticket));
    const jobId = args.job || args._[1];
    const files = {};
    for (const key of ["before", "after", "input", "used", "next-run"]) {
      if (args[key]) files[key] = resolve(String(args[key]));
    }
    let payment = null;
    if (args.payment) {
      payment = JSON.parse(readFileSync(resolve(String(args.payment)), "utf8"));
    }

    let executionId = args["execution-id"] ? assertExecutionId(String(args["execution-id"])) : null;
    let encoded;
    if (existsSync(ticketPath) && !executionId) {
      const existing = readTicket(ticketPath);
      if (existing.executionId) {
        executionId = existing.executionId;
        if (existing.request && existing.commitStatus && existing.commitStatus !== "rejected") {
          encoded = {
            request: existing.request,
            submitted: existing.submitted || {},
            frozen: existing.frozenRequest || null,
            executionId,
            expectedOutputs: existing.expectedOutputs || [],
          };
        }
      }
    }
    if (!encoded) {
      encoded = encodeExecuteRequest({
        jobId,
        files,
        fundingIntent: args.funding ? String(args.funding) : undefined,
        payment,
        example: args.example === true,
        executionId,
      });
      assertNoFilesystemPaths(encoded.request, Object.values(files));
    }

    const ticket = createTicket({
      origin,
      request: encoded.request,
      submitted: encoded.submitted,
      frozen: encoded.frozen,
      expectedOutputs: encoded.expectedOutputs,
    });
    writeTicketAtomic(ticketPath, ticket);

    const posted = await postExecute(origin, encoded.request, { timeoutMs: timeoutMs(120_000) });
    const next = updateTicketAfterPost(ticket, posted);
    writeTicketAtomic(ticketPath, next);
    const analysisOk = posted.classify.kind === "analysis-outcome" && posted.classify.ok === true;
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: analysisOk,
          ticket: next,
          classify: posted.classify,
          commitStatus: next.commitStatus,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(exitForClassify(posted.classify));
  }

  if (cmd === "fetch") {
    if (!args.ticket) throw new ConsumerRefuse("missing-ticket", "--ticket file is required");
    if (!args.out) throw new ConsumerRefuse("missing-out", "--out file is required");
    const ticket = readTicket(resolve(String(args.ticket)));
    const origin = args.base ? parseHttpOrigin(String(args.base)).origin : ticket.origin;
    if (!origin) throw new ConsumerRefuse("missing-base", "ticket.origin or --base is required");
    if (args.base && !originsEqual(origin, ticket.origin)) {
      throw new ConsumerRefuse("foreign-origin", "fetch --base does not match ticket.origin", {
        ticket: ticket.origin,
        base: origin,
      });
    }
    const localDir = args["local-artifacts"] ? resolve(String(args["local-artifacts"])) : null;
    const destDir = args["acquire-to"] ? resolve(String(args["acquire-to"])) : null;
    if ((localDir && !destDir) || (destDir && !localDir)) {
      throw new ConsumerRefuse(
        "missing-local-acquire",
        "fetch local acquisition requires both --local-artifacts DIR and --acquire-to DIR",
      );
    }

    const got = await getResult(origin, ticket.executionId, { timeoutMs: timeoutMs(15_000) });
    let classify = got.classify;
    const verified = got.body ? verifyTicketBoundResult(ticket, got.body, { retrieval: got.retrieval, httpStatus: got.status }) : {
      ok: false,
      failures: [{ code: "missing-body", message: "no result body" }],
      termsProof: null,
      identityHash: null,
      postIdentityMatch: null,
    };
    if (classify.kind === "analysis-outcome" && !verified.ok) {
      classify = {
        kind: "ticket-mismatch",
        code: verified.failures[0]?.code || "ticket-mismatch",
        ok: false,
        failures: verified.failures,
      };
    }

    let acquisition = portableAcquisitionUnsupported();
    if (localDir && destDir) {
      if (classify.kind !== "analysis-outcome") {
        throw new ConsumerRefuse("acquire-without-analysis", "local acquisition requires a verified analysis-outcome", {
          classify,
        });
      }
      const outputs = got.body?.outputs || got.body?.receipt?.outputs || [];
      acquisition = acquireLocalArtifacts({
        outputs,
        expectedNames: ticket.expectedOutputs || outputs.map((o) => o.name),
        localDir,
        destDir,
      });
    }
    acquisition.httpArtifactsDelivered = false;

    const result = {
      contract: got.body?.contract || ticket.contract || EXECUTION_CONTRACT_VERSION,
      origin,
      retrieval: { id: ticket.executionId, path: ticket.retrieval?.path },
      submitted: ticket.submitted,
      classify,
      httpStatus: got.status,
      verified,
      acquisition,
      result: got.body,
      httpArtifactsDelivered: false,
    };
    writeTicketAtomic(String(args.out), result);
    const analysisOk = classify.kind === "analysis-outcome" && classify.ok === true;
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: analysisOk,
          classify,
          executionId: ticket.executionId,
          acquisition,
          httpArtifactsDelivered: false,
          verified: { ok: verified.ok, failures: verified.failures },
        },
        null,
        2,
      )}\n`,
    );
    if (localDir && acquisition.code !== "local-acquired") process.exit(2);
    process.exit(exitForClassify(classify));
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

