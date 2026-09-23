#!/usr/bin/env node
// Apex MCP verifier. Rebase of SDS #148 limited to the shipped Express /mcp host.
// No gateway client.

import { emitEnvelope, envelope, exitFor, failError } from "./lib/envelope.mjs";
import { runMcp } from "./lib/mcp.mjs";
import { originDecision } from "./lib/origin.mjs";
import { resolveRoot } from "./lib/root.mjs";

export function usageText() {
  return [
    "apex MCP verify (shipped server/index.js /mcp only; no gateway client)",
    "",
    "  node tools/verify/cli.mjs mcp tools/list --json",
    "  node tools/verify/cli.mjs --seeded-failure absent-tool-not-32602 --json",
    "  node tools/verify/cli.mjs --seeded-failure absent-tool-32601 --json",
    "  node tools/verify/cli.mjs --seeded-failure gateway-24-tool-list --json",
    "",
    "Pass requires tools/list exactly the five apex tools and protocol 2024-11-05,",
    "and an absent tools/call of JSON-RPC -32602. A 24-tool list is rejected.",
    "Named tools/call, cite-pilot, and non-loopback origins are refused.",
    "",
  ].join("\n");
}

export function parseArgv(argv) {
  const flags = { json: false, pretty: false, dryRun: false, help: false, origin: null, seeded: null };
  const tokens = [];
  const missing = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--pretty") flags.pretty = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--origin") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) missing.push("--origin");
      else {
        flags.origin = value;
        i += 1;
      }
    } else if (arg === "--seeded-failure") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) missing.push("--seeded-failure");
      else {
        flags.seeded = value;
        i += 1;
      }
    } else if (arg.startsWith("--")) {
      missing.push(arg);
    } else {
      tokens.push(arg);
    }
  }
  return { flags, tokens, missing };
}

export async function main(argv) {
  const parsed = parseArgv(argv);
  let root;
  try {
    root = resolveRoot(process.cwd());
  } catch (error) {
    return envelope({
      ok: false,
      command: "mcp",
      status: "usage",
      error: failError("USAGE", error.message),
    });
  }

  if (parsed.missing.length) {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      status: "usage",
      error: failError("USAGE", `missing value for ${parsed.missing[0]}`),
    });
  }

  if (parsed.flags.help || (parsed.tokens.length === 0 && !parsed.flags.seeded)) {
    process.stderr.write(usageText());
    if (parsed.flags.help) {
      return envelope({ ok: true, command: "help", feature: "apex-mcp", dryRun: parsed.flags.dryRun });
    }
    return envelope({
      ok: false,
      command: "help",
      feature: "apex-mcp",
      status: "usage",
      error: failError("USAGE", "missing command"),
    });
  }

  const decision = originDecision(parsed.flags.origin);
  if (!decision.allow) {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      status: decision.code === "USAGE" ? "usage" : "fail",
      error: failError(decision.code, decision.message),
      result: { gatewayClient: false },
    });
  }

  return runMcp({
    root,
    tokens: parsed.tokens,
    seeded: parsed.flags.seeded,
    origin: decision.kind === "origin" ? decision.origin : null,
    dryRun: parsed.flags.dryRun,
  });
}

function isDirectRun() {
  const entry = process.argv[1] || "";
  return entry.endsWith("/tools/verify/cli.mjs") || entry.endsWith("\\tools\\verify\\cli.mjs");
}

if (isDirectRun()) {
  try {
    const env = await main(process.argv.slice(2));
    const pretty = process.argv.includes("--pretty");
    emitEnvelope(env, { pretty });
    process.exit(exitFor(env));
  } catch (error) {
    const env = envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      status: "error",
      error: failError("RUNTIME", error?.message || String(error)),
    });
    emitEnvelope(env, { pretty: process.argv.includes("--pretty") });
    process.exit(exitFor(env));
  }
}
