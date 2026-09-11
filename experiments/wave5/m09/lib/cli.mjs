import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCorpus, loadCase } from "./corpus.mjs";
import { resolveEngine, spawnCompare, readEnginePackage } from "./engine.mjs";
import { evaluateReplay } from "./evaluate.mjs";
import { PACKAGE_ROOT } from "./paths.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) fail("usage", `missing value for --${key}`);
      args[key] = value;
      i += 1;
      continue;
    }
    args._.push(token);
  }
  return args;
}

export function usage() {
  return `Usage:
  m09-replay journey [--out-dir DIR]
  m09-replay case --id ID [--out-dir DIR]
  m09-replay list

Replay independent page snapshots through the pinned Co13/M05 page-change CLI.
Does not fetch, pay, or vendor a compare kernel. Clock is required by the engine.
`;
}

function replayOne(caseDef, engine, outDir) {
  const spawn = spawnCompare({
    engine,
    before: caseDef.beforePath,
    after: caseDef.afterPath,
    fields: caseDef.fields,
    clock: caseDef.clock,
    outDir,
    extraArgs: caseDef.extraArgs ?? [],
  });
  const evaluation = evaluateReplay(caseDef, spawn);
  return { caseId: caseDef.id, spawn, evaluation, engine: readEnginePackage(engine) };
}

export async function runCli(argv, io = process) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ ok: false, code: error.code ?? "usage", message: error.message })}\n`);
    io.stderr.write(usage());
    return { exitCode: 2, error };
  }
  if (args.help || args._.length === 0) {
    io.stdout.write(usage());
    return { exitCode: args.help ? 0 : 2 };
  }

  try {
    const command = args._[0];
    if (command === "list") {
      const cases = loadCorpus();
      const body = {
        ok: true,
        cases: cases.map((item) => ({
          id: item.id,
          control: item.control,
          expectedVerdict: item.expected.verdict,
          remainingBinding: item.expected.remainingBinding ?? null,
        })),
      };
      io.stdout.write(`${JSON.stringify(body)}\n`);
      return { exitCode: 0, body };
    }

    if (command !== "case" && command !== "journey") {
      fail("usage", `unknown command: ${command}`);
    }

    const engine = resolveEngine();
    if (command === "case") {
      if (!args.id) fail("usage", "case requires --id");
      const caseDef = loadCase(args.id);
      const outDir = args["out-dir"] ?? mkdtempSync(join(tmpdir(), `m09-${caseDef.id}-`));
      mkdirSync(outDir, { recursive: true });
      const result = replayOne(caseDef, engine, outDir);
      const body = {
        ok: result.evaluation.ok,
        engine: result.engine,
        evaluation: result.evaluation,
        report: result.spawn.body?.report ?? null,
        refusal: result.spawn.refusal,
        written: result.spawn.body?.written ?? null,
      };
      writeFileSync(join(outDir, "replay.json"), `${JSON.stringify(body, null, 2)}\n`);
      io.stdout.write(`${JSON.stringify(body)}\n`);
      return { exitCode: result.evaluation.ok ? 0 : 1, body };
    }

    if (command === "journey") {
      const cases = loadCorpus();
      const outRoot = args["out-dir"] ?? join(PACKAGE_ROOT, "tmp-journey");
      mkdirSync(outRoot, { recursive: true });
      const results = [];
      for (const caseDef of cases) {
        const outDir = join(outRoot, caseDef.id);
        mkdirSync(outDir, { recursive: true });
        results.push(replayOne(caseDef, engine, outDir));
      }
      const failed = results.filter((item) => !item.evaluation.ok);
      const body = {
        ok: failed.length === 0,
        journey: true,
        engine: readEnginePackage(engine),
        counts: {
          cases: results.length,
          passed: results.length - failed.length,
          failed: failed.length,
        },
        results: results.map((item) => item.evaluation),
      };
      writeFileSync(join(outRoot, "replay.json"), `${JSON.stringify(body, null, 2)}\n`);
      io.stdout.write(`${JSON.stringify(body)}\n`);
      return { exitCode: body.ok ? 0 : 1, body };
    }

    fail("usage", `unknown command: ${command}`);
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ ok: false, code: error.code ?? "error", message: error.message })}\n`);
    return { exitCode: 2, error };
  }
}
