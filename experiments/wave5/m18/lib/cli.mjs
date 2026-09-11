import { PACKAGE_ROOT } from "./pins.mjs";
import { listCaseDirs, loadCase, loadCaseById } from "./cases.mjs";
import { runCase } from "./trial.mjs";
import { resolveEngine } from "./resolve-engine.mjs";

const VALUE_FLAGS = new Set(["case", "out-dir", "engine-root"]);
const BOOL_FLAGS = new Set(["help", "all"]);

function usage() {
  return `Usage:
  trial run --case ID --out-dir DIR
  trial run --all --out-dir DIR
  trial list

Compare already-held extract-batch JSON through the pinned page-change CLI.
Verifies a useful changed fact against captured bytes and evaluates capture
freshness at the query clock. Does not fetch, pay, or import merchant compare.mjs.
`;
}

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
      if (BOOL_FLAGS.has(key)) {
        args[key] = true;
        continue;
      }
      if (!VALUE_FLAGS.has(key)) fail("usage", `unknown option --${key}`);
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

export async function runCli(argv, io = process) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "usage", message: error.message })}\n`);
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
      const cases = listCaseDirs().map((dir) => loadCase(dir).id);
      io.stdout.write(`${JSON.stringify({ ok: true, cases }, null, 2)}\n`);
      return { exitCode: 0, cases };
    }
    if (command === "run") {
      const engine = resolveEngine({ engineRoot: args["engine-root"] });
      const outDir = args["out-dir"] || joinDefaultOut();
      const ids = args.all
        ? listCaseDirs().map((dir) => loadCase(dir).id)
        : args.case
          ? [args.case]
          : null;
      if (!ids) fail("usage", "run requires --case ID or --all");
      const results = [];
      for (const id of ids) {
        const dir = ids.length === 1 ? outDir : join(outDir, id);
        results.push(runCase(loadCaseById(id), { outDir: dir, engine }));
      }
      const body = ids.length === 1
        ? results[0]
        : { ok: results.every((item) => item.ok), results };
      io.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      return { exitCode: body.ok ? 0 : 2, body };
    }
    fail("usage", `unknown command: ${command}`);
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "error", message: error.message })}\n`);
    return { exitCode: 2, error };
  }
}

function joinDefaultOut() {
  return `${PACKAGE_ROOT}/tmp/trial`;
}

function join(base, id) {
  return `${base.replace(/\/$/, "")}/${id}`;
}
