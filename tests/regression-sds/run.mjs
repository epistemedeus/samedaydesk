#!/usr/bin/env node
/**
 * SameDayDesk SDS regression corpus runner.
 * Honest verdict uses product JSON ok / HTTP class. Naive verdict is the
 * wrapper-exit0 / HTML-body / HTTP-200 mistake that used to false-green a defect.
 */
import { envelope, failError, writeJson } from "./lib/envelope.mjs";
import { evaluateCase } from "./lib/evaluate.mjs";
import { executeCase } from "./lib/execute.mjs";
import { loadCorpus } from "./lib/load.mjs";
import { repoRoot } from "./lib/paths.mjs";

function takeValue(argv, i, flag) {
  const value = argv[i + 1];
  if (!value || value.startsWith("-")) return { error: flag };
  return { value, consumed: 1 };
}

function parseArgs(argv) {
  const out = { json: false, dryRun: false, caseId: null, seededFailure: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--list") out.list = true;
    else if (arg === "--case") {
      const taken = takeValue(argv, i, "--case");
      if (taken.error) out.unknown = taken.error;
      else {
        out.caseId = taken.value;
        i += taken.consumed;
      }
    } else if (arg === "--seeded-failure") {
      const taken = takeValue(argv, i, "--seeded-failure");
      if (taken.error) out.unknown = taken.error;
      else {
        out.seededFailure = taken.value;
        i += taken.consumed;
      }
    } else if (arg === "--help" || arg === "-h") out.help = true;
    else {
      out.unknown = arg;
    }
  }
  return out;
}

function usage() {
  return `SameDayDesk SDS regression corpus

node tests/regression-sds/run.mjs [--json] [--case <id>] [--dry-run]
node tests/regression-sds/run.mjs --list --json
node tests/regression-sds/run.mjs --seeded-failure false-green --json
node tests/regression-sds/run.mjs --seeded-failure false-reject --json

Does not pay Stripe/x402. Does not POST MCP tools/call. Does not mutate checkout.
`;
}

function human(line) {
  process.stderr.write(`${line}\n`);
}

async function runSelected(cases, { root, dryRun }) {
  const results = [];
  for (const loaded of cases) {
    human(`corpus ${loaded.id}`);
    if (dryRun) {
      results.push({
        id: loaded.spec.id,
        dryRun: true,
        execute: loaded.spec.execute.kind,
        argv: loaded.spec.execute.argv || null,
      });
      continue;
    }
    let observed;
    try {
      observed = await executeCase(loaded, { root });
    } catch (err) {
      observed = {
        exitCode: 64,
        json: {
          ok: false,
          refused: true,
          code: "execute-error",
          message: String(err.message || err),
        },
        timedOut: false,
        destExists: null,
      };
    }
    const evaluated = evaluateCase(loaded.spec, observed);
    results.push({
      ...evaluated,
      surface: loaded.spec.surface,
      feature: loaded.spec.feature,
      class: loaded.spec.class,
      roles: loaded.spec.roles || [],
      naiveRule: loaded.spec.expectCorpus.naiveRule,
      defect: loaded.spec.defect,
    });
  }
  return results;
}

function seededRole(flag) {
  if (flag === "false-green" || flag === "false-accept") return "seeded-false-green";
  if (flag === "false-reject") return "seeded-false-reject";
  return null;
}

function seededTarget(cases, role) {
  return cases.find((loaded) => (loaded.spec.roles || []).includes(role) && loaded.spec.class === role);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}
if (args.unknown) {
  writeJson(
    envelope({
      ok: false,
      command: "run",
      status: "usage",
      error: failError("USAGE", `unknown argument ${args.unknown}`),
    }),
  );
  process.exit(2);
}
if (args.seededFailure && !seededRole(args.seededFailure)) {
  writeJson(
    envelope({
      ok: false,
      command: "run",
      status: "usage",
      error: failError("USAGE", "--seeded-failure must be false-green, false-accept, or false-reject"),
    }),
  );
  process.exit(2);
}

let corpus;
try {
  corpus = loadCorpus();
} catch (err) {
  writeJson(
    envelope({
      ok: false,
      command: "run",
      status: "error",
      error: failError("CATALOG", err.message, err.detail),
    }),
  );
  process.exit(64);
}

const root = repoRoot();
const major = Number(process.versions.node.split(".")[0]);
if (major !== 22) {
  writeJson(
    envelope({
      ok: false,
      command: "run",
      status: "fail",
      error: failError("NODE", `wanted Node 22.x, actual ${process.version}`),
    }),
  );
  process.exit(1);
}

if (args.list) {
  writeJson(
    envelope({
      ok: true,
      command: "list",
      status: "pass",
      result: {
        cases: corpus.catalog.cases,
        count: corpus.catalog.cases.length,
      },
    }),
  );
  process.exit(0);
}

const selected = args.caseId
  ? corpus.cases.filter((loaded) => loaded.id === args.caseId)
  : corpus.cases;
if (args.caseId && selected.length === 0) {
  writeJson(
    envelope({
      ok: false,
      command: "run",
      status: "usage",
      error: failError("USAGE", `unknown case ${args.caseId}`),
    }),
  );
  process.exit(2);
}

if (args.seededFailure) {
  const role = seededRole(args.seededFailure);
  const target = seededTarget(corpus.cases, role);
  if (!target) {
    writeJson(
      envelope({
        ok: false,
        command: "run",
        status: "fail",
        error: failError("SEED_MISS", `no case with class/role ${role}`),
      }),
    );
    process.exit(1);
  }
  const results = await runSelected([target], { root, dryRun: args.dryRun });
  const row = results[0];
  const caught =
    role === "seeded-false-green" ? Boolean(row.falseGreen) : Boolean(row.falseReject);
  const honestPass = Boolean(row.honestCasePass);
  const okSeed = caught && honestPass && !args.dryRun;
  writeJson(
    envelope({
      ok: false,
      command: "run",
      status: "fail",
      feature: target.spec.feature,
      error: failError(
        okSeed ? "SEED_REJECT" : "SEED_MISS",
        okSeed
          ? `seeded ${args.seededFailure} caught on ${target.id}`
          : `seeded ${args.seededFailure} not caught on ${target.id}`,
        {
          id: target.id,
          falseGreen: row.falseGreen,
          falseAccept: row.falseAccept,
          falseReject: row.falseReject,
          honestCasePass: row.honestCasePass,
          naiveProductVerdict: row.naiveProductVerdict,
          honestProductVerdict: row.honestProductVerdict,
        },
      ),
      result: { seeded: args.seededFailure, case: row },
      boundary: target.spec.boundary,
    }),
  );
  process.exit(1);
}

const results = await runSelected(selected, { root, dryRun: args.dryRun });
if (args.dryRun) {
  writeJson(
    envelope({
      ok: true,
      command: "run",
      status: "pass",
      dryRun: true,
      result: { cases: results },
    }),
  );
  process.exit(0);
}

const failed = results.filter((row) => !row.honestCasePass);
const caughtFalseGreens = results.filter((row) => row.falseGreen).map((row) => row.id);
const caughtFalseRejects = results.filter((row) => row.falseReject).map((row) => row.id);
const designatedGreen = corpus.catalog.seededFalseGreen;
const designatedReject = corpus.catalog.seededFalseReject;
const caughtDesignated =
  caughtFalseGreens.includes(designatedGreen) && caughtFalseRejects.includes(designatedReject);
const ok = failed.length === 0 && caughtDesignated;

writeJson(
  envelope({
    ok,
    command: "run",
    status: ok ? "pass" : "fail",
    error: ok
      ? null
      : failError(
          failed.length ? "CASE_FAIL" : "SEED_MISS",
          failed.length
            ? `honest fail: ${failed.map((row) => row.id).join(",")}`
            : "designated seeded false-green/reject not caught",
        ),
    result: {
      passed: results.filter((row) => row.honestCasePass).length,
      failed: failed.length,
      total: results.length,
      caughtFalseGreens,
      caughtFalseRejects,
      designatedFalseGreen: designatedGreen,
      designatedFalseReject: designatedReject,
      cases: results,
    },
    evidence: results.map((row) => ({
      kind: "corpus-case",
      id: row.id,
      honestCasePass: row.honestCasePass,
      falseGreen: row.falseGreen,
      falseReject: row.falseReject,
    })),
  }),
);
process.exit(ok ? 0 : 1);
