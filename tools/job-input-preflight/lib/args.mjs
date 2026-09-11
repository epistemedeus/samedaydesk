import { CONTROL_FLAGS } from "./constants.mjs";

export function parseArgs(argv) {
  const out = { _: [], flags: {}, control: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.control.help = true;
      continue;
    }
    if (a === "--json") {
      out.control.json = true;
      continue;
    }
    if (a === "--example") {
      out.control.example = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const booleanLike = !next || next.startsWith("--");
      const value = booleanLike ? true : next;
      if (!booleanLike) i += 1;
      if (CONTROL_FLAGS.includes(key) || key.endsWith("-digest") || key.endsWith("-sha256") || key.endsWith("-bytes")) {
        out.control[key] = value;
      } else {
        out.flags[key] = value;
      }
      continue;
    }
    out._.push(a);
  }
  if (out.control.job && typeof out.control.job === "string") {
    out.jobId = out.control.job;
  } else {
    out.jobId = out._[0] || null;
  }
  return out;
}

export function usage() {
  return `job-input-preflight — check caller files or inline JSON against useful-jobs catalog requiredInputs

Usage:
  node tools/job-input-preflight/bin/preflight.mjs <job-id> --before <file|json> --after <file|json> [options]

Options:
  --catalog PATH|URL     Catalog JSON (default: client/public/for-agents/useful-jobs/catalog.json)
  --input-root DIR       Confine resolved input paths under this directory
  --declared-inputs JSON Object or file with per-flag digest/bytes identity claims
  --<flag>-digest VALUE  I01 sha256:<64 hex> or validate-next-run 64-hex
  --<flag>-bytes N       Declared byte length
  --out-dir DIR          Write preflight.json and staged bytes (never engine artifacts)
  --kit-root DIR         Optional useful-jobs kit root for samples/ path detection
  --d01-root DIR         Optional D01 checkout or paid-useful-jobs dir to consume inspectSample
  --help

Does not run useful-jobs or paid-useful-jobs. No spend, tool-cost, or settlement claims.
Invalid input schema and disguised SAMPLE are refused. Inline JSON is staged as files.
ok:true is bounded by execution.v1 1 MiB (input-oversize); kit cap remains 8 MiB.

Example (from repo root; relative inputs resolve under --input-root):
  node tools/job-input-preflight/bin/preflight.mjs vendor-budget-impact \\
    --before caller/vendor-budget-impact/before.json \\
    --after caller/vendor-budget-impact/after.json \\
    --input-root tools/job-input-preflight/fixtures
`;
}
