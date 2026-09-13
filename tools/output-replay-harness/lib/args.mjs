export class ReplayRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "ReplayRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function replayRefuse(code, message, detail) {
  return new ReplayRefuse(code, message, detail);
}

const RESERVED = new Set([
  "job",
  "out-a",
  "out-b",
  "example",
  "kit",
  "archive",
  "json",
  "help",
  "from",
  "expected-sha256",
  "expected-bytes",
]);

export function parseArgs(argv) {
  const out = { _: [], inputs: {}, inputsB: {}, example: false, json: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    const takesValue = next != null && !String(next).startsWith("--");
    if (key === "example") {
      out.example = true;
      continue;
    }
    if (key === "json") {
      out.json = true;
      continue;
    }
    if (key === "help" || key === "h") {
      out.help = true;
      continue;
    }
    if (!takesValue) {
      out[key] = true;
      continue;
    }
    i += 1;
    if (key === "job") out.job = next;
    else if (key === "out-a") out.outA = next;
    else if (key === "out-b") out.outB = next;
    else if (key === "kit") out.kit = next;
    else if (key === "archive") out.archive = next;
    else if (key === "from") out.from = next;
    else if (key === "expected-sha256") out.expectedSha256 = next;
    else if (key === "expected-bytes") out.expectedBytes = next;
    else if (key.endsWith("-b") && key !== "out-b") {
      out.inputsB[key.slice(0, -2)] = next;
    } else if (!RESERVED.has(key)) {
      out.inputs[key] = next;
    } else {
      out[key] = next;
    }
  }
  if (!out.job && out._[0] && out._[0] !== "replay") out.job = out._[0];
  return out;
}

export function usage() {
  return `output-replay-harness - replay a useful-jobs catalog job twice and classify output identity

Usage:
  node bin/replay.mjs --job <id> --out-a <dir> --out-b <dir> [--before …] [--after …] [--used …]
  node bin/replay.mjs --job <id> --example --out-a <dir> --out-b <dir>
  node bin/replay.mjs --job api-upgrade-brief --after-b <path> --out-a <dir> --out-b <dir> …

Identity (pinned useful-jobs 1.0.0):
  Compare catalog output filenames only.
  JSON identity ignores envelope generatedAt. Markdown timestamp chatter is
  not identity-break when identity JSON matches.
  SAMPLE / --example never reports identityVerified as a customer replay.

Classifications: identical | labelled-drift | identity-break
No purchase, settlement, or scheduler authority.
`;
}
