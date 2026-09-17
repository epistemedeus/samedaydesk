const USAGE = `Usage: node tools/verify/cli.mjs <command> [--json] [--dry-run] [--seeded-failure [id]]

Commands:
  doctor
  build [--skip-ci]
  serve start|stop|status|once [--port N]
  routes
  fetch --path /api/health [--origin URL]
  fetch --target gateway-unpaid | apex
  pack list
  pack run <id> [--extract-dir DIR] [-- <pack argv>]
  archive acquire [--version 1.4.7|1.1.0] [--dest PATH] [--extract-dir DIR]
  archive negative-control
  openapi check [--live]
  mcp tools/list [--origin URL]
  mcp cite-pilot
  presence cold-read [--live]
  presence refresh [--fixture DIR]
  prove --feature <id> [--seeded-failure]
  help

JSON envelope is always written to stdout. Human status goes to stderr.
--dry-run prints planned argv and does not spawn, pay, or call MCP tools.
Never POST payment. Never send PAYMENT-SIGNATURE. tools/call is out of scope.

Seeded failures (exit 1 JSON): sha-mismatch, missing-required-mcp-tool, missing-required-inputs.
`;

function takeValue(args, i, flag) {
  const next = args[i + 1];
  if (next == null || next.startsWith("-")) {
    return { missing: true, flag, index: i };
  }
  return { value: next, index: i + 1 };
}

const SEEDED_IDS = new Set([
  "sha-mismatch",
  "missing-required-mcp-tool",
  "missing-required-inputs",
  "wrong-digest",
]);

export function parseArgv(argv) {
  const out = {
    json: false,
    pretty: false,
    dryRun: false,
    seededFailure: false,
    seededId: null,
    help: false,
    root: null,
    command: null,
    tokens: [],
    flags: {},
    childArgv: [],
    missingValues: [],
    unknown: [],
  };
  const args = [...argv];
  const dash = args.indexOf("--");
  if (dash >= 0) {
    out.childArgv = args.slice(dash + 1);
    args.length = dash;
  }

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
    else if (a === "--skip-ci") out.flags.skipCi = true;
    else if (a === "--ci") out.flags.ci = true;
    else if (a === "--keep") out.flags.keep = true;
    else if (a === "--live") out.flags.live = true;
    else if (a === "--outside") out.flags.outside = true;
    else if (a === "--once") out.flags.once = true;
    else if (a === "--stop") out.flags.stop = true;
    else if (a === "--strict") out.flags.strict = true;
    else if (a === "--seeded-failure" || a === "--seeded-fail") {
      const next = args[i + 1];
      if (next && !next.startsWith("-") && SEEDED_IDS.has(next)) {
        out.seededFailure = true;
        out.seededId = next;
        i += 1;
      } else {
        out.seededFailure = true;
        out.seededId = "sha-mismatch";
      }
    } else if (
      a === "--root" ||
      a === "--path" ||
      a === "--port" ||
      a === "--origin" ||
      a === "--feature" ||
      a === "--fixture" ||
      a === "--id" ||
      a === "--from" ||
      a === "--dest" ||
      a === "--extract-dir" ||
      a === "--version" ||
      a === "--target" ||
      a === "--expected-sha256" ||
      a === "--expected-bytes" ||
      a === "--out-dir" ||
      a === "--timeout"
    ) {
      const key = a.slice(2);
      const got = takeValue(args, i, a);
      if (got.missing) out.missingValues.push(a);
      else {
        const value = key === "port" || key === "timeout" ? Number(got.value) : got.value;
        out.flags[key] = value;
        if (key === "extract-dir") out.flags.extractDir = value;
        if (key === "out-dir") out.flags.outDir = value;
        if (key === "expected-sha256") out.flags.expectedSha256 = value;
        if (key === "expected-bytes") out.flags.expectedBytes = value;
        i = got.index;
      }
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
  out.root = out.flags.root || null;

  if (out.command === "openapi-check") {
    out.command = "openapi";
    out.tokens = ["check", ...out.tokens];
  }
  if (out.command === "pack-run") {
    out.command = "pack";
    out.tokens = ["run", ...out.tokens];
  }
  if (out.command === "archive-acquire") {
    out.command = "archive";
    out.tokens = ["acquire", ...out.tokens];
  }
  if (out.command === "seeded-fail" || out.command === "seeded-failure") {
    out.seededFailure = true;
    out.seededId = out.tokens[0] || out.flags.id || "sha-mismatch";
    out.command = null;
  }
  return out;
}

export function usageText() {
  return USAGE;
}

export { USAGE, SEEDED_IDS };
