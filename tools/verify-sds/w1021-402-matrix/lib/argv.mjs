export const USAGE = `Usage: node tools/verify-sds/w1021-402-matrix/bin/prove.mjs [cold|map|suite|matrix|help] [flags]

Flags:
  --json
  --pretty
  --dry-run
  --seeded-failure [stale-listed-amount|wrong-units|paid-as-unpaid|silent-empty-success]
  --expect-reject CODE FILE
  --root PATH

JSON envelope is always written to stdout. Human status goes to stderr.
Cold prove binds committed fixtures/presence/catalog/x402.json (no network).
HTTP 402 is not settlement. Never pay, checkout, publish, or attach neo.
--live/--pay/--payment/--checkout/--publish/--registry/--refresh/--settle/--neo are refused.
`;

export const SEEDED_IDS = new Set([
  "stale-listed-amount",
  "wrong-units",
  "paid-as-unpaid",
  "silent-empty-success",
]);

export const REFUSED_FLAGS = Object.freeze([
  "live",
  "pay",
  "payment",
  "checkout",
  "publish",
  "registry",
  "refresh",
  "settle",
  "neo",
]);

function takeValue(args, i, flag) {
  const next = args[i + 1];
  if (next == null || next.startsWith("-")) {
    return { missing: true, flag, index: i };
  }
  return { value: next, index: i + 1 };
}

export function refusedFlag(argv) {
  for (const arg of argv) {
    const name = String(arg).replace(/^--/, "");
    if (REFUSED_FLAGS.includes(name)) return arg;
  }
  return null;
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
    files: [],
    missingValues: [],
    unknown: [],
    refused: refusedFlag(argv),
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
    else if (a === "--seeded-failure" || a === "--seeded-fail") {
      const next = args[i + 1];
      if (next && !next.startsWith("-") && SEEDED_IDS.has(next)) {
        out.seededFailure = true;
        out.seededId = next;
        i += 1;
      } else {
        out.seededFailure = true;
        out.seededId = "stale-listed-amount";
      }
    } else if (a === "--expect-reject") {
      const got = takeValue(args, i, a);
      if (got.missing) out.missingValues.push(a);
      else {
        out.flags.expectReject = got.value;
        i = got.index;
      }
    } else if (a === "--root") {
      const got = takeValue(args, i, a);
      if (got.missing) out.missingValues.push(a);
      else {
        out.flags.root = got.value;
        i = got.index;
      }
    } else if (a.startsWith("-")) {
      const name = a.replace(/^--/, "");
      if (REFUSED_FLAGS.includes(name)) continue;
      out.unknown.push(a);
    } else {
      positionals.push(a);
    }
  }

  if (positionals[0] === "help") out.help = true;
  else if (positionals[0] === "map") out.command = "map";
  else if (positionals[0] === "suite") out.command = "suite";
  else if (positionals[0] === "matrix") out.command = "matrix";
  else if (positionals[0] === "cold" || positionals[0] == null) out.command = "cold";
  else if (positionals[0].endsWith(".json") || positionals[0].includes("/")) {
    out.command = "files";
    out.files = positionals;
  } else {
    out.unknown.push(positionals[0]);
    out.files = positionals.slice(1);
  }

  if (out.seededFailure) out.command = "seeded-failure";
  if (out.flags.expectReject && out.files.length === 0 && positionals.length) {
    out.files = positionals.filter((p) => p.endsWith(".json") || p.includes("/"));
    if (out.files.length) out.command = "files";
  }

  return out;
}

export function isKnownSeed(id) {
  return SEEDED_IDS.has(id);
}
