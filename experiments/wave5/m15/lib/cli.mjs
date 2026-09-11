import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { listCorpusCases, loadSiblingM06Corpus } from "./corpus.mjs";
import { listPairs, loadPair, PAIR_IDS } from "./pairs.mjs";
import { KIT_ROOT, loadPins } from "./pins.mjs";
import { buildReport, IncompleteEngine, prepareEngine, runEngineCompare, writeReport } from "./run-trial.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function usage() {
  return `schema-change-trial - W5-M15 owner dry-run of pinned JSON Schema used-path drift

Not OpenAPI. Not api-upgrade-brief. Not a competing engine.
Maintainer usefulness stays unknown until actually received.
No spend, deploy, payout, or outbound messages.

Usage:
  node bin/schema-change-trial.mjs --pair <id> [--out-dir <dir>]
  node bin/schema-change-trial.mjs --corpus [--out-dir <dir>]
  node bin/schema-change-trial.mjs --list
  node bin/schema-change-trial.mjs --help

Pair ids:
  ${PAIR_IDS.join("\n  ")}

Engine: git-archive of W4-commerce-10 / W5-M02 pin, or M15_ENGINE_ROOT.
Public engine CLI after staging: node bin/webhook-drift.mjs --before --after --used
`;
}

function refuse(code, message, detail = {}) {
  return {
    ok: false,
    refused: true,
    code,
    error: message,
    detail,
    customerBrief: false,
    sold: false,
    purchaseAuthority: false,
    maintainerUsefulness: "unknown",
  };
}

export function runFromArgs(argv, { env = process.env } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    return { ok: true, help: true, text: usage(), exitCode: 0 };
  }
  if (args.list === true || args._[0] === "list") {
    const pins = loadPins();
    const m06 = loadSiblingM06Corpus();
    return {
      ok: true,
      pairs: listPairs().map((pair) => ({
        id: pair.id,
        license: pair.source.license,
        before: pair.source.before,
        after: pair.source.after,
      })),
      corpus: listCorpusCases().map((c) => c.id),
      m06: { status: m06.status, cases: m06.cases.length },
      engineSha: pins.m02.sha,
      fieldPhase: pins.field.status,
      exitCode: 0,
    };
  }

  const pins = loadPins();
  const outBase = args["out-dir"] ? resolve(String(args["out-dir"])) : mkdtempSync(join(tmpdir(), "m15-trial-"));
  mkdirSync(outBase, { recursive: true });

  let engine;
  try {
    engine = prepareEngine({ dest: join(outBase, ".engine"), env });
  } catch (err) {
    if (err instanceof IncompleteEngine) {
      const payload = refuse(err.code, err.message, err.detail);
      return { ...payload, incomplete: true, exitCode: 2 };
    }
    throw err;
  }

  if (args.corpus === true || args._[0] === "corpus") {
    const cases = listCorpusCases();
    const m06 = loadSiblingM06Corpus();
    const results = [];
    for (const corpusCase of cases) {
      const caseOut = join(outBase, "corpus", corpusCase.id);
      const ran = runEngineCompare({
        engine,
        before: corpusCase.files.before,
        after: corpusCase.files.after,
        used: corpusCase.files.used,
        outDir: caseOut,
      });
      const report = buildReport({
        command: "corpus",
        corpusCase,
        engine,
        classified: ran.classified,
        spawned: ran.spawned,
        args: ran.args,
        outDir: caseOut,
        pins,
      });
      writeReport(report, caseOut);
      results.push({
        id: corpusCase.id,
        prediction: corpusCase.meta?.prediction || null,
        outcome: report.outcome,
        termsVersion: report.outcome.termsVersion,
      });
    }
    const summary = {
      ok: results.every((row) => row.outcome.trialExecutionOk),
      command: "corpus",
      engineSha: engine.sha,
      m06,
      results,
      maintainerUsefulness: "unknown",
      exitCode: results.every((row) => row.outcome.trialExecutionOk) ? 0 : 2,
    };
    writeReport({ ...summary, schema: "samedaydesk.wave5.m15.corpus-run.v1" }, outBase);
    return summary;
  }

  const pairId = args.pair || args._[0] || "schemastore-package-sideEffects";
  let pair;
  try {
    pair = loadPair(pairId);
  } catch (err) {
    const payload = refuse("unknown-pair", String(err?.message || err), { pairId });
    return { ...payload, exitCode: 2 };
  }
  const pairOut = join(outBase, pair.id);
  const ran = runEngineCompare({
    engine,
    before: pair.files.before,
    after: pair.files.after,
    used: pair.files.used,
    outDir: pairOut,
  });
  const report = buildReport({
    command: "pair",
    pair,
    engine,
    classified: ran.classified,
    spawned: ran.spawned,
    args: ran.args,
    outDir: pairOut,
    pins,
  });
  writeReport(report, pairOut);
  return {
    ok: report.outcome.trialExecutionOk,
    command: "pair",
    pairId: pair.id,
    engineSha: engine.sha,
    outcome: report.outcome,
    reportPath: join(pairOut, "trial-report.json"),
    outDir: pairOut,
    maintainerUsefulness: "unknown",
    customerBrief: false,
    kitRoot: KIT_ROOT,
    exitCode: report.outcome.trialExecutionOk ? 0 : 2,
  };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = runFromArgs(argv);
    if (result.help) {
      process.stdout.write(result.text);
      process.exit(0);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.exitCode ?? (result.ok ? 0 : 2));
  } catch (err) {
    process.stdout.write(
      `${JSON.stringify(
        refuse("internal-error", String(err?.message || err), { name: err?.name || null }),
        null,
        2,
      )}\n`,
    );
    process.exit(1);
  }
}
