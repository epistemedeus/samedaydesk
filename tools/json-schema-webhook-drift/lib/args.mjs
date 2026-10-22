export class CliRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "CliRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
    this.ok = false;
    this.refused = true;
  }
}

export function cliRefuse(code, message, detail) {
  return new CliRefuse(code, message, detail);
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function usage() {
  return `json-schema-webhook-drift - used JSON Pointer drift (offline, Node built-ins)

Not OpenAPI. Not api-upgrade-brief. Nonsettling prototype. No purchase authority.

Usage:
  node bin/webhook-drift.mjs --before <json> --after <json> --used <json> [--out-dir <dir>]
  node bin/webhook-drift.mjs --example
  node bin/webhook-drift.mjs --help

--used is a JSON Pointer list:
  { "pointers": ["/properties/amount"] }

--example writes a SAMPLE brief. SAMPLE cannot be a customer brief.

Remote $ref is refused. Local #/ refs only. No network resolve.
A used path missing in both documents is unknown, not deleted.
Unused paths (including /properties/debug) are ignored.

Outputs: drift-brief.json, drift-brief.md
`;
}
