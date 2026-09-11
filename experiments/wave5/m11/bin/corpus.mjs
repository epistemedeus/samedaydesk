#!/usr/bin/env node
/**
 * Caller-supplied example corpus over the PR52 paid useful-jobs wrapper.
 * SAMPLE/--example kit demonstrations are not independently valid caller examples.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONTRACT_PATH, DEFAULT_CORPUS, enginePin } from "../lib/pins.mjs";
import { validateCorpus, runCorpus, compareCases } from "../lib/run-corpus.mjs";

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
  return `w5-m11 caller example corpus — PR52 wrapper consumer (not a second kernel)

Commands:
  help
  contract
  validate --corpus <dir|corpus.json>
  run --corpus <dir|corpus.json> [--out-dir dir]
  compare --corpus <dir> --a <case-id> --b <case-id>

Examples:
  node experiments/wave5/m11/bin/corpus.mjs run --corpus experiments/wave5/m11/caller-corpora
  node experiments/wave5/m11/bin/corpus.mjs compare \\
    --corpus experiments/wave5/m11/caller-corpora \\
    --a ops-desk-rate-raise --b vision-unit-shift

Kit SAMPLE / --example paths are refused as caller corpus members.
`;
}

function emit(body, exitCode) {
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exit(exitCode);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "contract") {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
  emit({ ok: true, contract, enginePin: enginePin() }, 0);
}

if (cmd === "validate") {
  const corpus = args.corpus || DEFAULT_CORPUS;
  const body = validateCorpus(resolve(String(corpus)));
  emit(body, body.ok ? 0 : 2);
}

if (cmd === "run") {
  const corpus = args.corpus || DEFAULT_CORPUS;
  const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : undefined;
  const body = runCorpus(resolve(String(corpus)), { outDir });
  emit(body, body.ok ? 0 : 2);
}

if (cmd === "compare") {
  const corpus = args.corpus || DEFAULT_CORPUS;
  if (!args.a || !args.b) {
    emit({ ok: false, code: "missing-case", error: "compare requires --a and --b case ids" }, 2);
  }
  const body = compareCases(resolve(String(corpus)), String(args.a), String(args.b));
  emit(body, body.ok && body.domain?.meaningful ? 0 : body.ok ? 3 : 2);
}

process.stderr.write(`unknown command ${cmd}\n`);
process.stdout.write(usage());
process.exit(2);
