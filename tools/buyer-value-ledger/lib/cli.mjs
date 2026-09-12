import { resolve } from "node:path";
import { ERROR_CODES, I01_OWNER, I01_PIN_NOTE, SDS_MAIN_PIN, CURRENT_RUNTIME_PIN, CURRENT_CATALOG_VERSION } from "./pins.mjs";
import { inspectBuyerClass, refuse } from "./labels.mjs";
import { attributeJobRevenue, honestyEnvelope } from "./revenue.mjs";
import { loadLedger } from "./ledger.mjs";
import { runLabelledJob, measureBatch } from "./run.mjs";
import { loadPublicCatalog } from "./engine.mjs";
import { CURRENT_CORE_BASE, EXECUTION_CONTRACT_VERSION, archiveEnginePin } from "../../job-request-desk/lib/current.mjs";

export function usage() {
  return `Buyer value ledger.
Measures durable desk/batch tickets from the current execution.v1 core (8a811bba / useful-jobs 1.4.3 unpublished).
Required buyerClass: owner-qa | fixture-buyer | unknown.
Never infers organic or independent demand. Never treats 8.105 USDC as this job's revenue.
Archive-origin/file overrides are refused. Failed and unknown results are not useful paid work.

node bin/value.mjs run vendor-budget-impact --buyer-class owner-qa --example --ledger ./ledger.json --out-dir ./out/example
node bin/value.mjs run vendor-budget-impact --buyer-class owner-qa --before ./before.json --after ./after.json --ledger ./ledger.json --out-dir ./out/caller
node bin/value.mjs batch --batch-id ID --store DIR --ledger ./ledger.json
node bin/value.mjs show --ledger ./ledger.json
node bin/value.mjs revenue --include-operation early-x402-revenue   # refused
node bin/value.mjs revenue --cited-banked-usdc                       # refused
`;
}

export function parseArgs(argv) {
  const out = { command: null, flags: {}, files: {} };
  const fileFlags = new Set(["before", "after", "used", "input", "next-run", "input-root"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--example") out.example = true;
    else if (arg === "--independent-demand" || arg === "--independent" || arg === "--as-independent") {
      out.independentDemand = true;
    } else if (arg === "--organic" || arg === "--organic-demand") {
      out.organic = true;
    } else if (arg === "--cited-banked-usdc") {
      out.citedBankedUsdc = true;
    } else if (arg === "--sum-settlements") {
      out.sumSettlements = true;
    } else if (arg === "--pretty") {
      out.pretty = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value == null || String(value).startsWith("--")) {
        out.unknown = arg;
        continue;
      }
      i += 1;
      if (fileFlags.has(key)) out.files[key] = value;
      else if (key === "buyer-class") out.buyerClass = value;
      else if (key === "ledger") out.ledger = value;
      else if (key === "store") out.storeDir = value;
      else if (key === "request-id") out.requestId = value;
      else if (key === "batch-id") out.batchId = value;
      else if (key === "out-dir") out.outDir = value;
      else if (key === "operation-id") out.operationId = value;
      else if (key === "include-operation") out.includeOperation = value;
      else if (key === "archive-origin") out.archiveOrigin = value;
      else if (key === "archive-file") out.archiveFile = value;
      else out.flags[key] = value;
    } else if (!out.command) {
      out.command = arg;
    } else if (!out.jobId) {
      out.jobId = arg;
    }
  }
  return out;
}

function printJson(payload, code, pretty = false) {
  process.stdout.write(`${JSON.stringify(payload, null, pretty ? 2 : 2)}\n`);
  return code;
}

function resolveMaybe(path, cwd) {
  if (!path) return path;
  return resolve(cwd, path);
}

export async function runCli(argv, { cwd = process.cwd(), adapters } = {}) {
  const args = parseArgs(argv);
  const pretty = args.pretty === true;
  if (args.help || !args.command) {
    process.stdout.write(`${usage()}\n`);
    return args.help ? 0 : 2;
  }

  if (args.unknown) {
    return printJson(
      refuse(ERROR_CODES.MISSING_REQUIRED_INPUTS, `unknown option ${args.unknown}`),
      2,
      pretty,
    );
  }

  if (args.command === "status") {
    return printJson(
      {
        ok: true,
        sdsMainPin: SDS_MAIN_PIN,
        currentCore: CURRENT_CORE_BASE || CURRENT_RUNTIME_PIN,
        catalogVersion: CURRENT_CATALOG_VERSION,
        executionContract: EXECUTION_CONTRACT_VERSION,
        i01: { owner: I01_OWNER, note: I01_PIN_NOTE },
        engine: archiveEnginePin(),
        engineIdentity: "wrapper-archive-identity for vendor-budget-impact; M01 jobs use source-identity pins",
        catalogJobs: loadPublicCatalog().jobs.map((job) => job.id),
        honesty: honestyEnvelope(),
        usefulPaidWork: false,
      },
      0,
      pretty,
    );
  }

  if (args.command === "revenue") {
    const result = attributeJobRevenue({
      includeOperation: args.includeOperation,
      includeOperationIds: args.includeOperation ? [args.includeOperation] : [],
      citedBankedUsdc: args.citedBankedUsdc === true,
      sumSettlements: args.sumSettlements === true,
    });
    return printJson(result, result.ok ? 0 : 2, pretty);
  }

  if (args.command === "show") {
    if (!args.ledger) {
      return printJson(refuse(ERROR_CODES.MISSING_REQUIRED_INPUTS, "show requires --ledger"), 2, pretty);
    }
    const ledger = loadLedger(resolveMaybe(args.ledger, cwd));
    return printJson(
      {
        ok: true,
        ledgerPath: resolveMaybe(args.ledger, cwd),
        rowCount: ledger.rows.length,
        independentDemand: ledger.rows.some((row) => row.independentDemand === true),
        samples: ledger.rows.map((row) => ({
          runId: row.runId,
          jobId: row.jobId,
          buyerClass: row.buyerClass,
          sample: row.sample,
          independentDemand: row.independentDemand,
          durationMs: row.durationMs,
          outputBytes: row.outputBytes,
          usableOutput: row.usableOutput,
          usefulPaidWork: row.usefulPaidWork === true,
          outcomeKind: row.outcomeKind || null,
        })),
        ledger,
        honesty: honestyEnvelope(),
      },
      0,
      pretty,
    );
  }

  if (args.command === "batch") {
    if (!args.storeDir || !args.batchId) return printJson(refuse('missing-batch-identity', 'batch requires --store and --batch-id'), 2);
    const result = measureBatch({ storeDir: resolveMaybe(args.storeDir, cwd), batchId: args.batchId, ledgerPath: args.ledger ? resolveMaybe(args.ledger, cwd) : undefined });
    return printJson(result, result.ok ? 0 : 2, pretty);
  }

  if (args.command === "run") {
    if (!args.jobId) {
      return printJson(refuse(ERROR_CODES.UNKNOWN_JOB, "run requires a job id"), 2, pretty);
    }
    const labelled = inspectBuyerClass({
      buyerClass: args.buyerClass,
      independentDemand: args.independentDemand === true,
      organic: args.organic === true,
    });
    if (!labelled.ok) return printJson(labelled, 2, pretty);

    const files = {};
    for (const [key, value] of Object.entries(args.files)) {
      files[key] = resolveMaybe(value, cwd);
    }

    if (args.archiveOrigin && args.archiveFile) {
      return printJson(
        refuse(ERROR_CODES.MISSING_REQUIRED_INPUTS, "use only one of --archive-origin or --archive-file"),
        2,
        pretty,
      );
    }

    if (args.archiveOrigin || args.archiveFile) return printJson(refuse('runner-override-refused', 'The current shared core owns engine acquisition'), 2, pretty);
    const kitOptions = {};

    const result = await runLabelledJob(
      {
        jobId: args.jobId,
        buyerClass: labelled.buyerClass,
        example: args.example === true,
        files,
        outDir: args.outDir ? resolveMaybe(args.outDir, cwd) : undefined,
        ledgerPath: args.ledger ? resolveMaybe(args.ledger, cwd) : undefined,
        operationId: args.operationId,
        storeDir: args.storeDir ? resolveMaybe(args.storeDir, cwd) : undefined,
        requestId: args.requestId,
        kitOptions,
      },
      adapters,
    );
    return printJson(result, result.ok ? 0 : 2, pretty);
  }

  return printJson(
    refuse(ERROR_CODES.UNKNOWN_COMMAND, "command must be run, show, revenue, status, or batch"),
    2,
    pretty,
  );
}
