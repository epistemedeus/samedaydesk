#!/usr/bin/env node
/**
 * SDS unpaid MCP list/call fixtures CLI (w1020).
 * Boundary: tools/verify-sds/w1020-mcp-unpaid/** only.
 * Never Stripe/x402 spend, never PAYMENT-SIGNATURE, never paid tools/call.
 *
 * Usage:
 *   node tools/verify-sds/w1020-mcp-unpaid/cli.mjs tools/list [--json] [--origin URL]
 *   node tools/verify-sds/w1020-mcp-unpaid/cli.mjs tools/call ...   # USAGE/PAID refuse
 *   node tools/verify-sds/w1020-mcp-unpaid/cli.mjs --seeded-failure <id> [--json]
 *   node tools/verify-sds/w1020-mcp-unpaid/cli.mjs run [--json]     # cold harness
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MCP_TOOLS,
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  FEATURE,
  SEEDED,
  PAID_TOOL,
  APEX_ORIGIN,
  looksLikePaymentUrl,
} from "./lib/catalog.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import {
  listTools,
  toolNames,
  assertUnpaidCallAllowed,
  resolveMcpUrl,
} from "./lib/client.mjs";
import { runSeeded } from "./lib/refuse.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    tokens: [],
    flags: {},
    seededId: null,
    help: false,
    json: true,
    pretty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--pretty") out.pretty = true;
    else if (a === "--human") out.json = false;
    else if (a === "--seeded-failure") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out.missing = "--seeded-failure";
      else {
        out.seededId = next;
        i++;
      }
    } else if (a === "--fixture") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out.missing = "--fixture";
      else {
        out.fixture = next;
        i++;
      }
    } else if (a === "--origin") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out.missing = "--origin";
      else {
        out.flags.origin = next;
        i++;
      }
    } else if (a === "--path") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out.missing = "--path";
      else {
        out.flags.path = next;
        i++;
      }
    } else if (a === "--live") {
      out.flags.live = true;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out.tokens.push(a);
    }
  }
  return out;
}

function usage() {
  return `sds w1020-mcp-unpaid — unpaid tools/list fixtures (loopback preferred)

Commands:
  tools/list              initialize + tools/list against fixture (or --origin)
  tools/call ...          refuse (never paid Fix Pack call; list-only)
  run                     cold harness: unpaid list exit 0 + seeded refuses
  cite-apex               document live apex URL (read-only cite; no POST pay)

Seeded failures (exit ≠ 0, clear code, paymentSent=false, toolsCalled=false):
  --seeded-failure paid-tool-call
  --seeded-failure payment-signature
  --seeded-failure stripe-path

Options:
  --origin URL            MCP base origin (default: loopback fixture; Stripe/cs= refused)
  --live                  optional read-only cite of ${APEX_ORIGIN}/mcp (no call)
  --json / --pretty       JSON envelope on stdout
  --fixture PATH          load seeded fixture JSON

Apex five tools: ${MCP_TOOLS.join(", ")}
Paid (list-only): ${PAID_TOOL}
Never send: PAYMENT-SIGNATURE, X-PAYMENT, stripe-signature
`;
}

async function runList({ origin, live }) {
  const evidence = [
    {
      kind: "argv",
      argv: ["initialize", "tools/list"],
      note: "unpaid list-only; never tools/call; never PAYMENT-SIGNATURE",
    },
  ];

  let handle = null;
  let mcpUrl;
  let source;

  try {
    if (origin) {
      if (looksLikePaymentUrl(origin)) {
        return envelope({
          ok: false,
          command: "tools/list",
          feature: FEATURE,
          status: "fail",
          error: failError(
            "STRIPE_PATH_REFUSE",
            `refusing Stripe/checkout path in unpaid harness: ${origin}`,
            { origin },
          ),
          result: {
            refused: true,
            path: origin,
            paymentSent: false,
            toolsCalled: false,
            neverOpenedCheckout: true,
          },
        });
      }
      try {
        mcpUrl = resolveMcpUrl(origin);
      } catch (e) {
        return envelope({
          ok: false,
          command: "tools/list",
          feature: FEATURE,
          status: e.code === "USAGE" ? "usage" : "fail",
          error: failError(e.code || "USAGE", e.message, { origin }),
          result: { refused: true, path: origin, paymentSent: false, toolsCalled: false },
        });
      }
      source = "origin";
    } else if (live) {
      evidence.push({
        kind: "live-cite",
        url: `${APEX_ORIGIN}/mcp`,
        note: "optional read-only cite; harness proof uses loopback fixture",
      });
      handle = await startFixtureServer();
      mcpUrl = handle.url;
      source = "fixture+live-cite";
    } else {
      handle = await startFixtureServer();
      mcpUrl = handle.url;
      source = "fixture";
    }

    evidence.push({ kind: "mcp-url", url: mcpUrl, source });

    const session = await listTools(mcpUrl);
    const names = toolNames(session.listed);
    const protocol = session.initialize.json?.result?.protocolVersion;
    const info = session.initialize.json?.result?.serverInfo;

    evidence.push({
      kind: "http",
      initialize: { status: session.initialize.status, protocol, serverInfo: info },
      list: { status: session.listed.status, toolCount: names.length },
    });
    evidence.push({
      kind: "mcp-tools",
      names,
      required: [...MCP_TOOLS],
      listedBeforeCall: true,
    });

    if (session.initialize.status !== 200 || session.listed.status !== 200) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        evidence,
        error: failError("HOST_BUILD", "MCP HTTP non-200", {
          initialize: session.initialize.status,
          list: session.listed.status,
        }),
      });
    }

    if (protocol !== MCP_PROTOCOL) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        evidence,
        error: failError("HOST_BUILD", `protocol must be ${MCP_PROTOCOL}`, { protocol }),
      });
    }

    if (info?.name !== MCP_SERVER_INFO.name) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        evidence,
        error: failError("HOST_BUILD", "unexpected serverInfo", { info }),
      });
    }

    const missing = MCP_TOOLS.filter((n) => !names.includes(n));
    if (missing.length) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        evidence,
        error: failError("SEED_REJECT", "missing required MCP tool", { missing, names }),
        result: { tools: names, missing, listedBeforeCall: true },
      });
    }

    return envelope({
      ok: true,
      command: "tools/list",
      feature: FEATURE,
      evidence,
      result: {
        tools: names,
        protocol,
        serverInfo: info,
        listedBeforeCall: true,
        toolsCalled: false,
        paymentSent: false,
        source,
        mcpUrl,
        paidToolListedNotCalled: PAID_TOOL,
        shippedProcessCite: "server/index.js → server/routes/mcp.js",
        wave: "w1020",
        priorCite: "PR182 heavy/w0-x70-mcp-unpaid-rev (patterns; owned path is tools/verify-sds/w1020-mcp-unpaid/**)",
      },
    });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function runCallRefuse(tokens) {
  const tool = tokens[2] || tokens.find((t) => t.includes("_")) || PAID_TOOL;
  try {
    assertUnpaidCallAllowed("tools/call", { name: tool }, { allowFreeCall: false });
  } catch (e) {
    return envelope({
      ok: false,
      command: "tools/call",
      feature: FEATURE,
      status: e.code === "PAID_REFUSE" ? "fail" : "usage",
      error: failError(e.code || "USAGE", e.message, { tool: e.tool || tool }),
      result: {
        refused: true,
        tool: e.tool || tool,
        toolsCalled: false,
        paymentSent: false,
        note: "Documented unpaid tools/call refuse — harness never POSTs call or PAYMENT-SIGNATURE",
      },
    });
  }
  return envelope({
    ok: false,
    command: "tools/call",
    status: "usage",
    error: failError("USAGE", "tools/call is out of unpaid verify scope"),
  });
}

async function runColdHarness() {
  const steps = [];
  const listEnv = await runList({});
  steps.push({
    step: "unpaid-tools-list",
    ok: listEnv.ok,
    exit: exitFor(listEnv),
    tools: listEnv.result?.tools,
  });

  const seeds = ["paid-tool-call", "payment-signature", "stripe-path"];
  for (const id of seeds) {
    const env = runSeeded(id, id === "stripe-path" ? { path: "/api/checkout" } : {});
    const ex = exitFor(env);
    steps.push({
      step: `seeded:${id}`,
      ok: env.ok,
      exit: ex,
      code: env.error?.code,
      refused: env.result?.refused === true,
      paymentSent: env.boundary?.paymentSent,
      toolsCalled: env.boundary?.toolsCalled,
    });
  }

  const listOk = listEnv.ok === true && exitFor(listEnv) === 0;
  const seedsOk = steps
    .filter((s) => s.step.startsWith("seeded:"))
    .every((s) => s.ok === false && s.exit !== 0 && s.refused === true && s.paymentSent === false && s.toolsCalled === false);

  return envelope({
    ok: listOk && seedsOk,
    command: "run",
    feature: FEATURE,
    evidence: [{ kind: "harness-steps", steps }],
    error: listOk && seedsOk
      ? null
      : failError("HARNESS_FAIL", "cold harness failed unpaid list or seeded refuse", { steps }),
    result: {
      listOk,
      seedsOk,
      steps,
      boundary: { paymentSent: false, toolsCalled: false },
    },
  });
}

function loadFixture(path) {
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  if (!existsSync(full)) {
    const alt = join(here, path);
    if (existsSync(alt)) return JSON.parse(readFileSync(alt, "utf8"));
    return null;
  }
  return JSON.parse(readFileSync(full, "utf8"));
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.missing) {
    const env = envelope({
      ok: false,
      command: "unknown",
      status: "usage",
      error: failError("USAGE", `missing value for ${parsed.missing}`),
    });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exitCode = exitFor(env);
    return;
  }

  if (parsed.help || parsed.tokens[0] === "help") {
    process.stderr.write(usage());
    const env = envelope({ ok: true, command: "help" });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exitCode = 0;
    return;
  }

  let env;

  if (parsed.fixture) {
    const fix = loadFixture(parsed.fixture);
    if (!fix) {
      env = envelope({
        ok: false,
        command: "fixture",
        status: "usage",
        error: failError("USAGE", `fixture not found: ${parsed.fixture}`),
      });
    } else {
      const seedId = fix.seededId || fix.id;
      env = runSeeded(seedId, fix.opts || {});
    }
  } else if (parsed.seededId) {
    env = runSeeded(parsed.seededId, {
      path: parsed.flags.path,
      tool: parsed.flags.tool,
      header: parsed.flags.header,
    });
  } else {
    const t0 = parsed.tokens[0];
    if (t0 === "run" || (parsed.tokens.length === 0 && !parsed.flags.origin)) {
      if (t0 === "run") {
        env = await runColdHarness();
      } else if (parsed.tokens.length === 0) {
        process.stderr.write(usage());
        env = envelope({
          ok: false,
          command: "unknown",
          status: "usage",
          error: failError("USAGE", "expected tools/list | tools/call | run | --seeded-failure <id>"),
        });
      }
    }

    if (!env) {
      let tokens = parsed.tokens;
      if (tokens[0] === "tools/list") tokens = ["tools", "list", ...tokens.slice(1)];
      if (tokens[0] === "tools/call") tokens = ["tools", "call", ...tokens.slice(1)];

      if (tokens[0] === "cite-apex" || tokens[0] === "cite") {
        env = envelope({
          ok: true,
          command: "cite-apex",
          feature: FEATURE,
          result: {
            url: `${APEX_ORIGIN}/mcp`,
            tools: [...MCP_TOOLS],
            note: "Live apex cited read-only; cold proof uses loopback fixture. Never POST payment.",
            toolsCalled: false,
            paymentSent: false,
          },
        });
      } else if (tokens[0] === "tools" && tokens[1] === "call") {
        env = runCallRefuse(tokens);
      } else if (
        tokens[0] === "tools" &&
        (tokens[1] == null || tokens[1] === "list")
      ) {
        env = await runList({
          origin: parsed.flags.origin,
          live: Boolean(parsed.flags.live),
        });
      } else if (tokens[0] === "list") {
        env = await runList({
          origin: parsed.flags.origin,
          live: Boolean(parsed.flags.live),
        });
      } else {
        env = envelope({
          ok: false,
          command: tokens[0] || "unknown",
          status: "usage",
          error: failError(
            "USAGE",
            "w1020-mcp-unpaid tools/list | tools/call | run | --seeded-failure <id>",
            { knownSeeds: Object.keys(SEEDED) },
          ),
        });
      }
    }
  }

  emitEnvelope(env, { pretty: parsed.pretty, human: true });
  process.exitCode = exitFor(env);
}

main().catch((e) => {
  const env = envelope({
    ok: false,
    command: "runtime",
    status: "error",
    error: failError("RUNTIME", e.message),
  });
  emitEnvelope(env);
  process.exitCode = exitFor(env);
});
