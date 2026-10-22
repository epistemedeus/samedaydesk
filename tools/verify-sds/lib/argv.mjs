import { HORIZON_HOURS_DEFAULT, SEEDED_DEFAULT, SEEDED_IDS } from "./pins.mjs";

const USAGE = `Usage: node tools/verify-sds/cli.mjs <command> [--json] [--dry-run] [--seeded-failure [id]]

SDS lab-verify: doctor plus three unpaid offline jobs (useful-jobs, packs, mcp).
Rejects stale receipts. Never pays, never POSTs MCP tools/call, never fetches.

Commands:
  doctor
  jobs
  run useful-jobs | packs | mcp | --all
  accept --output <receipt.json> [--clock ISO] [--horizon-hours N]
  help

  run --out <receipt.json> writes a fresh receipt after a passing job.

JSON envelope is always written to stdout. Human status goes to stderr.
--dry-run prints planned argv and does not extract, spawn, or hash archives.
--clock ISO pins the verifier clock. Default horizon is ${HORIZON_HOURS_DEFAULT}h.

Seeded failures (exit 1 JSON): stale-output, stale-clock, stale-pin.
`;

function takeValue(args, i, flag) {
  const next = args[i + 1];
  if (next == null || next.startsWith("-")) {
    return { missing: true, flag, index: i };
  }
  return { value: next, index: i + 1 };
}

export function parseArgv(argv) {
  const out = {
    json: false,
    pretty: false,
    dryRun: false,
    seededFailure: false,
    seededId: null,
    help: false,
    all: false,
    keep: false,
    command: null,
    tokens: [],
    flags: {},
    missingValues: [],
    unknown: [],
  };
  const args = [...argv];
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--json") out.json = true;
    else if (a === "--pretty") {
      out.pretty = true;
      out.json = true;
    } else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--all") out.all = true;
    else if (a === "--keep") out.keep = true;
    else if (a === "--seeded-failure" || a === "--seeded-fail") {
      const next = args[i + 1];
      if (next && !next.startsWith("-") && SEEDED_IDS.includes(next)) {
        out.seededFailure = true;
        out.seededId = next;
        i += 1;
      } else {
        out.seededFailure = true;
        out.seededId = SEEDED_DEFAULT;
      }
    } else if (
      a === "--root" ||
      a === "--clock" ||
      a === "--now" ||
      a === "--output" ||
      a === "--out" ||
      a === "--fixture" ||
      a === "--extract-dir" ||
      a === "--horizon-hours" ||
      a === "--id"
    ) {
      const key = a.slice(2);
      const got = takeValue(args, i, a);
      if (got.missing) out.missingValues.push(a);
      else {
        let value = got.value;
        if (key === "horizon-hours") value = Number(got.value);
        out.flags[key] = value;
        if (key === "extract-dir") out.flags.extractDir = value;
        if (key === "horizon-hours") out.flags.horizonHours = value;
        if (key === "now") out.flags.clock = out.flags.clock || value;
        i = got.index;
      }
    } else if (a === "--live" || a === "--pay" || a === "--tools-call") {
      out.unknown.push(a);
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        out.flags[key] = next;
        i += 1;
      } else {
        out.flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }

  out.command = positionals[0] || null;
  out.tokens = positionals.slice(1);

  if (out.tokens.includes("all")) out.all = true;
  if (out.command === "all") {
    out.command = "run";
    out.all = true;
  }
  if (out.command === "seeded-fail" || out.command === "seeded-failure") {
    out.seededFailure = true;
    out.seededId = out.tokens[0] || out.flags.id || SEEDED_DEFAULT;
    out.command = out.command && out.command.startsWith("seeded") ? null : out.command;
    if (!out.command) out.command = "accept";
  }
  if (!out.command && out.seededFailure) out.command = "accept";
  if (out.flags.horizonHours == null) out.flags.horizonHours = HORIZON_HOURS_DEFAULT;
  return out;
}

export function usageText() {
  return USAGE;
}

export { USAGE };
