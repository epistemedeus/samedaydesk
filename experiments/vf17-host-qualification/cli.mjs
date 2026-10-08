#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIntake } from "./src/aggregate.mjs";
import { compareAggregates } from "./src/compare.mjs";
import { loadBudgets, loadPins } from "./src/plan.mjs";
import { redactSecrets } from "./src/redact.mjs";
import { rejectSeed } from "./src/reject.mjs";
import { formatSummary } from "./src/summary.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const HARNESS_FILES = [
  "cli.mjs",
  "PINS.json",
  "budgets.json",
  "src/aggregate.mjs",
  "src/compare.mjs",
  "src/envelope.mjs",
  "src/fanout.mjs",
  "src/metrics.mjs",
  "src/pg.mjs",
  "src/plan.mjs",
  "src/qualify.mjs",
  "src/redact.mjs",
  "src/reject.mjs",
  "src/status.mjs",
  "src/summary.mjs",
];

function usage() {
  return [
    "node experiments/vf17-host-qualification/cli.mjs run [--out FILE] [--intake FILE]",
    "node experiments/vf17-host-qualification/cli.mjs summary --input FILE",
    "node experiments/vf17-host-qualification/cli.mjs compare --baseline FILE --input FILE",
    "node experiments/vf17-host-qualification/cli.mjs reject-seed --fixture FILE",
  ].join("\n");
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("options require --name value");
    }
    opts[key.slice(2)] = value;
  }
  return { mode: mode ?? "help", opts };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function gitHead() {
  try {
    return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function harnessFiles() {
  return HARNESS_FILES.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(join(root, path))).digest("hex"),
  }));
}

function containsSecret(text, secrets) {
  return secrets.some((secret) => secret && text.includes(secret));
}

async function runMode(opts) {
  const { privatePG } = await import("./src/pg.mjs");
  const { runQualification } = await import("./src/qualify.mjs");
  const handle = await privatePG();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    handle.stop();
  };
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stop();
    process.exit(143);
  });
  try {
    const report = await runQualification(handle, {
      onCell(cell) {
        process.stderr.write(`vf17 ${cell.id} acquired=${cell.acquiredClients} status=${cell.status}\n`);
      },
    });
    report.measuredAt = new Date().toISOString();
    report.gitHead = gitHead();
    report.pins = loadPins();
    report.budgets = loadBudgets();
    report.harnessFiles = harnessFiles();
    const encoded = JSON.stringify(report);
    if (containsSecret(encoded, handle.secrets)) {
      throw new Error("refusing to write a report that contains a cluster password");
    }
    const out = resolve(opts.out ?? join(root, "evidence/qualification.json"));
    const intakePath = resolve(opts.intake ?? join(root, "aggregate/sds254-owner-intake.json"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    if (report.status === "complete") {
      const intake = buildIntake(report);
      const intakeText = JSON.stringify(intake);
      if (containsSecret(intakeText, handle.secrets)) {
        throw new Error("refusing to write an intake that contains a cluster password");
      }
      mkdirSync(dirname(intakePath), { recursive: true });
      writeFileSync(intakePath, `${JSON.stringify(intake, null, 2)}\n`);
    }
    console.log(formatSummary(report));
    process.exitCode = report.status === "complete" ? 0 : 1;
  } catch (err) {
    console.error(redactSecrets(err.message || String(err), handle.secrets));
    process.exitCode = 1;
  } finally {
    stop();
  }
}

async function main() {
  const { mode, opts } = parseArgs(process.argv.slice(2));
  if (mode === "help" || mode === "--help") {
    console.log(usage());
    return;
  }
  if (mode === "reject-seed") {
    if (!opts.fixture) throw new Error("reject-seed requires --fixture FILE");
    try {
      rejectSeed(readJson(opts.fixture));
    } catch (err) {
      if (err.code === "VF17_SEEDED_REJECT") {
        console.log(err.message);
        process.exitCode = 1;
        return;
      }
      if (err.code === "VF17_SEED_MISSED") {
        console.error(err.message);
        process.exitCode = 2;
        return;
      }
      throw err;
    }
    return;
  }
  if (mode === "summary") {
    if (!opts.input) throw new Error("summary requires --input FILE");
    console.log(formatSummary(readJson(opts.input)));
    return;
  }
  if (mode === "compare") {
    if (!opts.baseline || !opts.input) throw new Error("compare requires --baseline FILE --input FILE");
    const result = compareAggregates(readJson(opts.baseline), readJson(opts.input));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "comparable" ? 0 : 1;
    return;
  }
  if (mode === "run") {
    await runMode(opts);
    return;
  }
  console.error(usage());
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(redactSecrets(err.message || String(err), []));
  process.exitCode = 1;
});
