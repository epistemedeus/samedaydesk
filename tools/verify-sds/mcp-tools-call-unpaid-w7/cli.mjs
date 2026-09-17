#!/usr/bin/env node
/**
 * SDS MCP tools/call unpaid isError fixtures CLI (w7 / W0-X135).
 * Boundary: tools/verify-sds/mcp-tools-call-unpaid-w7/** only.
 * Never Stripe/x402 spend, never PAYMENT-SIGNATURE, never paid tools/call POST.
 *
 * Usage:
 *   node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs tools/call [tool] [--json]
 *   node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs --seeded-failure <id> [--json]
 *   node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs run [--json]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  FEATURE,
  SEEDED,
  PAID_TOOL,
  UNPAID_CALL_TOOL,
  FREE_TOOLS,
  APEX_ORIGIN,
} from "./lib/catalog.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import {
  callUnpaidTool,
  assertIsErrorShape,
  assertUnpaidCallAllowed,
} from "./lib/client.mjs";
import { runSeeded } from "./lib/refuse.mjs";
import {
  resolveLoopbackMcpUrl,
  refuseLiveFlag,
} from "./lib/origin.mjs";

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
      out.seededId = argv[++i];
      if (!out.seededId) out.missing = "--seeded-failure";
    } else if (a === "--fixture") {
      out.fixture = argv[++i];
    } else if (a === "--origin") {
      out.flags.origin = argv[++i];
    } else if (a === "--path") {
      out.flags.path = argv[++i];
    } else if (a === "--tool") {
      out.flags.tool = argv[++i];
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
  return `sds mcp-tools-call-unpaid-w7 — unpaid tools/call → MCP isError fixtures

Commands:
  tools/call [tool]       unpaid free-tool call against fixture; assert isError (exit 0)
  run                     cold harness: unpaid isError ok + seeded refuses
  cite-apex               document live apex URL (read-only cite; no POST pay)

Seeded failures (exit ≠ 0, clear code, paymentSent=false):
  --seeded-failure paid-tool-call
  --seeded-failure payment-signature
  --seeded-failure stripe-path

Options:
  --origin URL            http loopback MCP origin only (default: spawned fixture)
  --tool NAME             free tool for isError demo (default: ${UNPAID_CALL_TOOL})
  --json / --pretty       JSON envelope on stdout
  --fixture PATH          load seeded fixture JSON
  --live                  refused (LIVE_REFUSE); live apex is cite-apex only

Default unpaid call tool: ${UNPAID_CALL_TOOL}
Free tools: ${FREE_TOOLS.join(", ")}
Paid (never POST): ${PAID_TOOL}
Never send: PAYMENT-SIGNATURE, X-PAYMENT, stripe-signature
`;
}

async function runUnpaidIsErrorCall({ origin, tool, live }) {
  const toolName = tool || UNPAID_CALL_TOOL;
  const evidence = [
    {
      kind: "argv",
      argv: ["tools/call", toolName],
      note: "unpaid tools/call → assert MCP isError; never PAYMENT-SIGNATURE; never paid tool POST",
    },
  ];

  try {
    if (live) refuseLiveFlag();
    assertUnpaidCallAllowed("tools/call", { name: toolName });
  } catch (e) {
    return envelope({
      ok: false,
      command: "tools/call",
      feature: FEATURE,
      status: e.code === "PAID_REFUSE" || e.code === "LIVE_REFUSE" || e.code === "STRIPE_PATH_REFUSE"
        ? "fail"
        : "usage",
      error: failError(e.code || "USAGE", e.message, {
        tool: e.tool || toolName,
        origin: e.origin,
        path: e.path,
      }),
      result: {
        refused: true,
        tool: e.tool || toolName,
        paymentSent: false,
        paidToolsCallPosted: false,
        note: "Paid / unknown / live origin refused before POST",
      },
    });
  }

  let handle = null;
  let mcpUrl;
  let source;

  try {
    if (origin) {
      try {
        mcpUrl = resolveLoopbackMcpUrl(origin);
      } catch (e) {
        return envelope({
          ok: false,
          command: "tools/call",
          feature: FEATURE,
          status: e.code === "USAGE" ? "usage" : "fail",
          error: failError(e.code || "LIVE_REFUSE", e.message, {
            origin: e.origin || origin,
            path: e.path,
          }),
          result: {
            refused: true,
            origin,
            paymentSent: false,
            paidToolsCallPosted: false,
            neverPostedCall: true,
          },
        });
      }
      source = "origin";
    } else {
      handle = await startFixtureServer();
      mcpUrl = handle.url;
      source = "fixture";
    }

    evidence.push({ kind: "mcp-url", url: mcpUrl, source });

    const session = await callUnpaidTool(mcpUrl, toolName, {});
    const protocol = session.initialize.json?.result?.protocolVersion;
    const info = session.initialize.json?.result?.serverInfo;

    evidence.push({
      kind: "http",
      initialize: { status: session.initialize.status, protocol, serverInfo: info },
      call: { status: session.called.status, tool: toolName },
    });

    if (session.initialize.status !== 200 || !session.called || session.called.status !== 200) {
      return envelope({
        ok: false,
        command: "tools/call",
        feature: FEATURE,
        evidence,
        error: failError("HOST_BUILD", "MCP HTTP non-200", {
          initialize: session.initialize.status,
          call: session.called?.status ?? null,
        }),
      });
    }

    if (protocol !== MCP_PROTOCOL) {
      return envelope({
        ok: false,
        command: "tools/call",
        feature: FEATURE,
        evidence,
        error: failError("HOST_BUILD", `protocol must be ${MCP_PROTOCOL}`, { protocol }),
      });
    }

    if (info?.name !== MCP_SERVER_INFO.name) {
      return envelope({
        ok: false,
        command: "tools/call",
        feature: FEATURE,
        evidence,
        error: failError("HOST_BUILD", "unexpected serverInfo", { info }),
      });
    }

    let shape;
    try {
      shape = assertIsErrorShape(session.called);
    } catch (e) {
      return envelope({
        ok: false,
        command: "tools/call",
        feature: FEATURE,
        evidence,
        error: failError(e.code || "ISERROR_SHAPE", e.message, e.detail),
        result: {
          tool: toolName,
          paymentSent: false,
          unpaidCallPosted: true,
          isError: session.called.json?.result?.isError,
        },
      });
    }

    evidence.push({
      kind: "mcp-isError",
      tool: toolName,
      isError: true,
      textPreview: String(shape.text).slice(0, 200),
    });

    return envelope({
      ok: true,
      command: "tools/call",
      feature: FEATURE,
      evidence,
      boundary: {
        paymentSent: false,
        paidToolsCallPosted: false,
        unpaidToolsCallPosted: true,
      },
      result: {
        tool: toolName,
        isError: true,
        content: shape.content,
        text: shape.text,
        protocol,
        serverInfo: info,
        paymentSent: false,
        paidToolsCallPosted: false,
        unpaidCallPosted: true,
        source,
        mcpUrl,
        shippedProcessCite: "server/index.js → server/routes/mcp.js",
        w0x70Cite: "PR162 bot/w0-x70-mcp-unpaid tools/verify-sds/mcp-unpaid/** (list/refuse patterns; this path is tools/call unpaid isError)",
        w0b2Cite: "PR148 heavy/w0-b2-verify-sds tools/verify/lib/mcp.mjs (patterns only)",
      },
    });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function runColdHarness() {
  const steps = [];
  const callEnv = await runUnpaidIsErrorCall({ tool: UNPAID_CALL_TOOL });
  steps.push({
    step: "unpaid-tools-call-isError",
    ok: callEnv.ok,
    exit: exitFor(callEnv),
    tool: callEnv.result?.tool,
    isError: callEnv.result?.isError,
    paymentSent: callEnv.boundary?.paymentSent,
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
      paidToolsCallPosted: env.boundary?.paidToolsCallPosted,
    });
  }

  const callOk =
    callEnv.ok === true &&
    exitFor(callEnv) === 0 &&
    callEnv.result?.isError === true &&
    callEnv.boundary?.paymentSent === false;
  const seedsOk = steps
    .filter((s) => s.step.startsWith("seeded:"))
    .every(
      (s) =>
        s.ok === false &&
        s.exit !== 0 &&
        s.refused === true &&
        s.paymentSent === false &&
        s.paidToolsCallPosted === false,
    );

  return envelope({
    ok: callOk && seedsOk,
    command: "run",
    feature: FEATURE,
    evidence: [{ kind: "harness-steps", steps }],
    error:
      callOk && seedsOk
        ? null
        : failError("HARNESS_FAIL", "cold harness failed unpaid isError or seeded refuse", {
            steps,
          }),
    result: {
      callOk,
      seedsOk,
      steps,
      boundary: { paymentSent: false, paidToolsCallPosted: false },
    },
  });
}

function loadFixture(path) {
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  let candidate = full;
  if (!existsSync(candidate)) {
    const alt = join(here, path);
    if (!existsSync(alt)) return { error: `fixture not found: ${path}` };
    candidate = alt;
  }
  try {
    return { data: JSON.parse(readFileSync(candidate, "utf8")) };
  } catch {
    return { error: `fixture JSON parse failed: ${path}` };
  }
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

  if (parsed.flags.live === true) {
    let liveErr;
    try {
      refuseLiveFlag();
    } catch (e) {
      liveErr = e;
    }
    const env = envelope({
      ok: false,
      command: parsed.tokens[0] || "live",
      feature: FEATURE,
      status: "fail",
      error: failError(liveErr?.code || "LIVE_REFUSE", liveErr?.message || "refusing --live"),
      result: {
        refused: true,
        live: true,
        paymentSent: false,
        paidToolsCallPosted: false,
        neverPostedCall: true,
      },
    });
    emitEnvelope(env, { pretty: parsed.pretty, human: true });
    process.exitCode = exitFor(env);
    return;
  }

  let env;

  if (parsed.fixture) {
    const loaded = loadFixture(parsed.fixture);
    if (loaded.error) {
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
    });
  } else {
    const t0 = parsed.tokens[0];
    if (t0 === "run") {
      env = await runColdHarness();
    } else if (parsed.tokens.length === 0) {
      process.stderr.write(usage());
      env = envelope({
        ok: false,
        command: "unknown",
        status: "usage",
        error: failError(
          "USAGE",
          "expected tools/call | run | --seeded-failure <id>",
        ),
      });
    } else {
      let tokens = parsed.tokens;
      if (tokens[0] === "tools/call") tokens = ["tools", "call", ...tokens.slice(1)];
      if (tokens[0] === "tools/list") tokens = ["tools", "list", ...tokens.slice(1)];

      if (tokens[0] === "cite-apex" || tokens[0] === "cite") {
        env = envelope({
          ok: true,
          command: "cite-apex",
          feature: FEATURE,
          result: {
            url: `${APEX_ORIGIN}/mcp`,
            unpaidCallTool: UNPAID_CALL_TOOL,
            freeTools: [...FREE_TOOLS],
            paidToolNeverPosted: PAID_TOOL,
            note: "Live apex cited read-only; cold proof uses loopback fixture unpaid tools/call → isError. Never POST payment.",
            paymentSent: false,
            paidToolsCallPosted: false,
          },
        });
      } else if (tokens[0] === "tools" && tokens[1] === "call") {
        const toolArg = tokens[2] || parsed.flags.tool || UNPAID_CALL_TOOL;
        env = await runUnpaidIsErrorCall({
          origin: parsed.flags.origin,
          tool: toolArg,
          live: parsed.flags.live === true,
        });
      } else if (tokens[0] === "call") {
        env = await runUnpaidIsErrorCall({
          origin: parsed.flags.origin,
          tool: tokens[1] || parsed.flags.tool || UNPAID_CALL_TOOL,
          live: parsed.flags.live === true,
        });
      } else if (tokens[0] === "tools" && tokens[1] === "list") {
        env = envelope({
          ok: false,
          command: "tools/list",
          status: "usage",
          error: failError(
            "USAGE",
            "tools/list belongs to mcp-unpaid (X70); this w7 path is unpaid tools/call → isError",
          ),
        });
      } else {
        env = envelope({
          ok: false,
          command: tokens[0] || "unknown",
          status: "usage",
          error: failError(
            "USAGE",
            "mcp-tools-call-unpaid-w7 tools/call | run | --seeded-failure <id>",
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
