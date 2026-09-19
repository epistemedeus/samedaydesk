#!/usr/bin/env node
/**
 * SDS unpaid MCP list/call fixtures CLI (w1040).
 * Boundary: tools/verify-sds/w1040-mcp-unpaid/** only.
 * Never Stripe/x402 spend, never PAYMENT-SIGNATURE, never paid tools/call.
 *
 * Usage:
 *   node tools/verify-sds/w1040-mcp-unpaid/cli.mjs tools/list [--json] [--origin URL]
 *   node tools/verify-sds/w1040-mcp-unpaid/cli.mjs tools/call ...   # USAGE/PAID refuse
 *   node tools/verify-sds/w1040-mcp-unpaid/cli.mjs --seeded-failure <id> [--json]
 *   node tools/verify-sds/w1040-mcp-unpaid/cli.mjs run [--json]     # cold harness
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MCP_TOOLS,
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  FEATURE,
  WINDOW,
  SEEDED,
  PAID_TOOL,
  APEX_ORIGIN,
} from "./lib/catalog.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import {
  listTools,
  getMcp,
  toolNames,
  assertUnpaidCallAllowed,
} from "./lib/client.mjs";
import { runSeeded } from "./lib/refuse.mjs";
import {
  resolveLoopbackMcpUrl,
  refuseLiveFlag,
} from "./lib/origin.mjs";
import {
  assertSourcePin,
  PINNED_TOOLS_BLOCK_SHA256,
} from "./lib/source-pin.mjs";

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
  return `sds w1040-mcp-unpaid — unpaid tools/list fixtures (loopback only)

Commands:
  tools/list              initialize + tools/list against fixture (or --origin loopback)
  tools/call ...          refuse (never paid Fix Pack call; list-only)
  run                     cold harness: unpaid list exit 0 + seeded refuses
  cite-apex               document live apex URL (read-only cite; no POST pay)

Seeded failures (exit ≠ 0, clear code, paymentSent=false, toolsCalled=false):
  --seeded-failure paid-tool-call
  --seeded-failure payment-signature
  --seeded-failure stripe-path
  --seeded-failure cs-query
  --seeded-failure tools-sha-mismatch

Options:
  --origin URL            http loopback MCP origin only (default: spawned fixture)
  --live                  refused (LIVE_REFUSE); live apex is cite-apex only
  --json / --pretty       JSON envelope on stdout
  --fixture PATH          load seeded fixture JSON

Apex five tools: ${MCP_TOOLS.join(", ")}
Paid (list-only): ${PAID_TOOL}
Never send: PAYMENT-SIGNATURE, X-PAYMENT, stripe-signature
`;
}

function refuseEnvelope(command, e, extra = {}) {
  const failCodes = new Set([
    "PAID_REFUSE",
    "LIVE_REFUSE",
    "STRIPE_PATH_REFUSE",
    "PAYMENT_HEADER_REFUSE",
    "TOOLS_SHA_MISMATCH",
    "HOST_BUILD",
  ]);
  return envelope({
    ok: false,
    command,
    feature: FEATURE,
    window: WINDOW,
    status: failCodes.has(e.code) ? "fail" : "usage",
    error: failError(e.code || "USAGE", e.message, {
      origin: e.origin,
      path: e.path,
      tool: e.tool,
      got: e.got,
      want: e.want,
      ...extra.detail,
    }),
    result: {
      refused: true,
      paymentSent: false,
      toolsCalled: false,
      neverPostedCall: true,
      ...extra.result,
    },
  });
}

async function runList({ origin, live }) {
  const evidence = [
    {
      kind: "argv",
      argv: ["initialize", "tools/list"],
      note: "unpaid list-only; never tools/call; never PAYMENT-SIGNATURE",
    },
  ];

  try {
    if (live) refuseLiveFlag();
  } catch (e) {
    return refuseEnvelope("tools/list", e);
  }

  let pin;
  try {
    pin = assertSourcePin();
    evidence.push({
      kind: "source-pin",
      sha256: pin.sha256,
      expected: PINNED_TOOLS_BLOCK_SHA256,
      names: pin.names,
      source: "server/routes/mcp.js",
    });
  } catch (e) {
    return refuseEnvelope("tools/list", e);
  }

  let handle = null;
  let mcpUrl;
  let source;

  try {
    if (origin) {
      try {
        mcpUrl = resolveLoopbackMcpUrl(origin);
      } catch (e) {
        return refuseEnvelope("tools/list", e, {
          result: { path: origin, origin, neverOpenedCheckout: e.code === "STRIPE_PATH_REFUSE" },
        });
      }
      source = "origin";
    } else {
      handle = await startFixtureServer();
      mcpUrl = handle.url;
      source = "fixture";
    }

    evidence.push({ kind: "mcp-url", url: mcpUrl, source });

    const banner = await getMcp(mcpUrl);
    evidence.push({
      kind: "http-get",
      status: banner.status,
      unpaidBanner: /w1040-mcp-unpaid/.test(banner.body || ""),
    });
    if (banner.status !== 200) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        window: WINDOW,
        evidence,
        error: failError("HOST_BUILD", "MCP GET non-200", { status: banner.status }),
      });
    }

    const session = await listTools(mcpUrl);
    const names = toolNames(session.listed);
    const protocol = session.initialize.json?.result?.protocolVersion;
    const info = session.initialize.json?.result?.serverInfo;

    evidence.push({
      kind: "http",
      initialize: { status: session.initialize.status, protocol, serverInfo: info },
      list: { status: session.listed?.status ?? null, toolCount: names.length },
    });
    evidence.push({
      kind: "mcp-tools",
      names,
      required: [...MCP_TOOLS],
      listedBeforeCall: true,
    });

    if (session.initialize.status !== 200 || !session.listed || session.listed.status !== 200) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        window: WINDOW,
        evidence,
        error: failError("HOST_BUILD", "MCP HTTP non-200", {
          initialize: session.initialize.status,
          list: session.listed?.status ?? null,
        }),
      });
    }

    if (protocol !== MCP_PROTOCOL) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        window: WINDOW,
        evidence,
        error: failError("HOST_BUILD", `protocol must be ${MCP_PROTOCOL}`, { protocol }),
      });
    }

    if (info?.name !== MCP_SERVER_INFO.name) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        window: WINDOW,
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
        window: WINDOW,
        evidence,
        error: failError("SEED_REJECT", "missing required MCP tool", { missing, names }),
        result: { tools: names, missing, listedBeforeCall: true },
      });
    }

    return envelope({
      ok: true,
      command: "tools/list",
      feature: FEATURE,
      window: WINDOW,
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
        toolsBlockSha256: pin.sha256,
        shippedProcessCite: "server/index.js → server/routes/mcp.js",
        wave: WINDOW,
        priorCite:
          "PR201 w1020 + PR182 x70-rev + PR199 x135-rev (patterns; owned path is tools/verify-sds/w1040-mcp-unpaid/**)",
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
      window: WINDOW,
      status: e.code === "PAID_REFUSE" ? "fail" : "usage",
      error: failError(e.code || "USAGE", e.message, { tool: e.tool || tool }),
      result: {
        refused: true,
        tool: e.tool || tool,
        toolsCalled: false,
        paymentSent: false,
        neverPostedCall: true,
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

  const seeds = [
    "paid-tool-call",
    "payment-signature",
    "stripe-path",
    "cs-query",
    "tools-sha-mismatch",
  ];
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
    window: WINDOW,
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
  const candidates = [];
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  candidates.push(full);
  candidates.push(join(here, path));
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return { ok: true, data: JSON.parse(readFileSync(candidate, "utf8")) };
    } catch (e) {
      return { ok: false, error: `fixture parse failed: ${e.message}` };
    }
  }
  return { ok: false, error: `fixture not found: ${path}` };
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
    const loaded = loadFixture(parsed.fixture);
    if (!loaded.ok) {
      env = envelope({
        ok: false,
        command: "fixture",
        status: "usage",
        error: failError("USAGE", loaded.error),
      });
    } else {
      const seedId = loaded.data.seededId || loaded.data.id;
      env = runSeeded(seedId, loaded.data.opts || {});
    }
  } else if (parsed.seededId) {
    env = runSeeded(parsed.seededId, {
      path: parsed.flags.path,
      tool: parsed.flags.tool,
      header: parsed.flags.header,
      expectedSha: parsed.flags["expected-sha"],
    });
  } else {
    const t0 = parsed.tokens[0];
    if (t0 === "run" || (parsed.tokens.length === 0 && !parsed.flags.origin && !parsed.flags.live)) {
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
          window: WINDOW,
          result: {
            url: `${APEX_ORIGIN}/mcp`,
            tools: [...MCP_TOOLS],
            note: "Live apex cited read-only; cold proof uses loopback fixture. Never POST payment.",
            toolsCalled: false,
            paymentSent: false,
          },
        });
      } else if (tokens[0] === "tools" && tokens[1] === "call") {
        if (parsed.flags.live) {
          try {
            refuseLiveFlag();
          } catch (e) {
            env = refuseEnvelope("tools/call", e);
          }
        }
        if (!env) env = runCallRefuse(tokens);
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
            "w1040-mcp-unpaid tools/list | tools/call | run | --seeded-failure <id>",
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
