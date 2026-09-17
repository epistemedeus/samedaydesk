export const USAGE = `Usage: node tools/verify-sds/features/useful-jobs/bin/prove.mjs [cold|map|help] [flags]

Flags:
  --json
  --pretty
  --dry-run
  --keep
  --expect-product-reject
  --seeded-failure [missing-required-inputs|sha-mismatch|silent-empty-success]
  --root PATH
  --extract-dir PATH
  --fixture PATH

JSON envelope is always written to stdout. Human status goes to stderr.
--dry-run prints planned argv and does not extract, spawn the useful-jobs CLI, or pay.
Never POST payment. Never publish or refresh a registry.
`;

const SEEDED_IDS = new Set([
  "missing-required-inputs",
  "sha-mismatch",
  "wrong-digest",
  "silent-empty-success",
]);

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
    command: "cold",
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
    else if (a === "--expect-product-reject") out.flags.expectProductReject = true;
    else if (a === "--keep") out.flags.keep = true;
    else if (a === "--seeded-failure" || a === "--seeded-fail") {
      const next = args[i + 1];
      if (next && !next.startsWith("-") && SEEDED_IDS.has(next)) {
        out.seededFailure = true;
        out.seededId = next === "wrong-digest" ? "sha-mismatch" : next;
        i += 1;
      } else {
        out.seededFailure = true;
        out.seededId = "missing-required-inputs";
      }
    } else if (a === "--root" || a === "--extract-dir" || a === "--fixture") {
      const key = a === "--extract-dir" ? "extractDir" : a.slice(2);
      const got = takeValue(args, i, a);
      if (got.missing) out.missingValues.push(a);
      else {
        out.flags[key] = got.value;
        i = got.index;
      }
    } else if (a.startsWith("-")) {
      out.unknown.push(a);
    } else {
      positionals.push(a);
    }
  }

  if (positionals[0] === "help") out.help = true;
  else if (positionals[0] === "map") out.command = "map";
  else if (positionals[0] === "cold" || positionals[0] == null) out.command = "cold";
  else {
    out.unknown.push(positionals[0]);
  }

  return out;
}

export function isKnownSeed(id) {
  return SEEDED_IDS.has(id);
}
