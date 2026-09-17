#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseArgv, usageText } from "./lib/argv.mjs";
import { emitEnvelope, envelope, exitFor, failError } from "./lib/envelope.mjs";
import { resolveRoot } from "./lib/repo.mjs";
import { runDoctor } from "./lib/doctor.mjs";
import { listJobs, runJobs } from "./lib/jobs.mjs";
import { runAccept } from "./lib/accept.mjs";
import { JOB_IDS } from "./lib/pins.mjs";

function clockOf(parsed) {
  return parsed.flags.clock || new Date().toISOString();
}

function writeOut(parsed, ctx, env) {
  const out = parsed.flags.out;
  if (!out || !env.receipt) return;
  const path = isAbsolute(out) ? out : join(ctx.root, out);
  writeFileSync(path, `${JSON.stringify(env.receipt, null, 2)}\n`);
}

async function dispatch(parsed, ctx) {
  if (parsed.unknown.length) {
    return envelope({
      ok: false,
      command: parsed.command || "unknown",
      status: "usage",
      error: failError(
        "USAGE",
        `refused ${parsed.unknown[0]}: lab-verify is unpaid and offline (no --live, --pay, or tools/call)`,
      ),
    });
  }
  if (parsed.missingValues.length) {
    return envelope({
      ok: false,
      command: parsed.command || "unknown",
      status: "usage",
      error: failError("USAGE", `missing value for ${parsed.missingValues[0]}`),
    });
  }
  if (parsed.help || parsed.command === "help") {
    process.stderr.write(usageText());
    return envelope({ ok: true, command: "help", dryRun: parsed.dryRun });
  }

  if (parsed.seededFailure && (parsed.command === "accept" || !parsed.command)) {
    return runAccept(parsed, ctx);
  }

  const command = parsed.command;
  if (!command) {
    process.stderr.write(usageText());
    return envelope({
      ok: false,
      command: "help",
      status: "usage",
      error: failError("USAGE", "missing command"),
    });
  }

  switch (command) {
    case "doctor":
      return runDoctor(ctx);
    case "jobs":
      return envelope({
        ok: true,
        command: "jobs",
        jobs: listJobs(),
        result: { jobs: listJobs() },
      });
    case "run": {
      const ids = parsed.all || parsed.flags.all ? [...JOB_IDS] : parsed.tokens.filter((t) => t !== "all");
      if (!ids.length) {
        return envelope({
          ok: false,
          command: "run",
          status: "usage",
          error: failError("USAGE", "run useful-jobs | packs | mcp | --all"),
        });
      }
      return runJobs(ids, ctx);
    }
    case "accept":
      return runAccept(parsed, ctx);
    default:
      return envelope({
        ok: false,
        command,
        status: "usage",
        error: failError("USAGE", `unknown command ${command}`),
      });
  }
}

async function main(argv) {
  const parsed = parseArgv(argv);
  const root = resolveRoot(parsed.flags.root);
  const ctx = {
    root,
    dryRun: parsed.dryRun,
    clock: clockOf(parsed),
    flags: parsed.flags,
    keep: parsed.keep,
  };
  let env;
  try {
    env = await dispatch(parsed, ctx);
  } catch (error) {
    env = envelope({
      ok: false,
      command: parsed.command || "unknown",
      status: "error",
      dryRun: parsed.dryRun,
      error: failError("RUNTIME", error?.message || String(error)),
    });
  }
  env.dryRun = Boolean(ctx.dryRun);
  env.boundary = { paymentSent: false, toolsCalled: false };
  if (parsed.flags.out && env.ok && env.receipt) writeOut(parsed, ctx, env);
  emitEnvelope(env, { pretty: parsed.pretty, root });
  return exitFor(env);
}

const code = await main(process.argv.slice(2));
process.exit(code);
