import { exportJobArtifacts } from "./export.mjs";
import { importJobArtifacts } from "./import.mjs";
import { refuse } from "./refuse.mjs";
import { SAMPLE_LABEL, SALE_LABEL } from "./labels.mjs";
import { REPO_ROOT } from "./pins.mjs";

export function usage() {
  return `Export a completed useful-jobs out-dir as zip plus JSONL provenance, then import the same zip bytes.

node tools/job-artifact-export/bin/export.mjs export --in-dir <out-dir> --out <dir>
  [--label SAMPLE|sale] [--as customer-delivery] [--job-id <id>] [--catalog <catalog.json>]
  [--archive-sha256 <sha>]

node tools/job-artifact-export/bin/export.mjs import --zip <job-artifacts.zip> --out <dir>
  [--zip-sha256 sha256:<hex>] [--catalog <catalog.json>]

SAMPLE cannot be marked customer-delivery. Per-file cap is 8MiB. Not result-reuse.
Not a sale settlement. Engine pin and termsVersion are sha256: content hashes (I01/PR54).
Archive identity is the sha256 of the useful-jobs tar.gz bytes actually read.
Import hashes the zip bytes it consumes before parse. Caller digest claims cannot replace those bytes.
`;
}

export function parseArgs(argv) {
  const out = { repoRoot: REPO_ROOT };
  let i = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    out.command = argv[0];
    i = 1;
  }
  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--in-dir") out.inDir = optionValue(argv, ++i);
    else if (arg === "--out") out.out = optionValue(argv, ++i);
    else if (arg === "--zip") out.zip = optionValue(argv, ++i);
    else if (arg === "--zip-sha256") out.zipSha256 = optionValue(argv, ++i);
    else if (arg === "--label") out.label = optionValue(argv, ++i);
    else if (arg === "--as") out.as = optionValue(argv, ++i);
    else if (arg === "--job-id") out.jobId = optionValue(argv, ++i);
    else if (arg === "--catalog") out.catalog = optionValue(argv, ++i);
    else if (arg === "--archive-sha256") out.archiveSha256 = optionValue(argv, ++i);
    else if (arg === "--clock") out.clock = optionValue(argv, ++i);
    else throw refuse("unknown-option", `unknown option ${arg}`);
  }
  if (out.label && out.label !== SAMPLE_LABEL && out.label !== SALE_LABEL) {
    throw refuse("invalid-label", "label must be SAMPLE or sale");
  }
  if (out.as && out.as !== "customer-delivery" && out.as !== "customer") {
    throw refuse("invalid-as", "--as only accepts customer-delivery (and SAMPLE refuses it)");
  }
  return out;
}

function optionValue(argv, index) {
  const value = argv[index];
  if (value == null || value.startsWith("--")) throw refuse("missing-option-value", "option requires a value");
  return value;
}

export function runCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    return { stdout: `${usage()}\n`, exitCode: 0, payload: null };
  }
  if (!args.command) {
    return { stdout: `${usage()}\n`, exitCode: 2, payload: null };
  }
  if (args.command !== "export" && args.command !== "import") {
    throw refuse("unknown-command", "command must be export or import");
  }
  const result = args.command === "import" ? importJobArtifacts(args) : exportJobArtifacts(args);
  return { stdout: `${JSON.stringify(result, null, 2)}\n`, exitCode: 0, payload: result };
}
