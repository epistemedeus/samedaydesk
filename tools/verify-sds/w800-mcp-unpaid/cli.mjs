#!/usr/bin/env node
/**
 * SDS w800 unpaid MCP list + safe call/isError fixtures CLI.
 * Boundary: tools/verify-sds/w800-mcp-unpaid/** only.
 * Never Stripe/x402 spend, never PAYMENT-SIGNATURE, never paid tools/call POST.
 *
 * Usage:
 *   node tools/verify-sds/w800-mcp-unpaid/cli.mjs tools/list [--json]
 *   node tools/verify-sds/w800-mcp-unpaid/cli.mjs tools/call [tool] [--json]
 *   node tools/verify-sds/w800-mcp-unpaid/cli.mjs --seeded-failure <id> [--json]
 *   node tools/verify-sds/w800-mcp-unpaid/cli.mjs run [--json]
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
  UNPAID_CALL_TOOL,
  FREE_TOOLS,
  APEX_ORIGIN,
  looksLikePaymentUrl,
} from "./lib/catalog.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import {
  listTools,
  callUnpaidTool,
  toolNames,
  assertIsErrorShape,
  assertUnpaidCallAllowed,
} from "./lib/client.mjs";
import { runSeeded } from "./lib/refuse.mjs";
import { resolveLoopbackMcpUrl, refuseLiveFlag } from "./lib/origin.mjs";
import { PINNED_TOOLS_BLOCK_SHA256, assertSourcePin } from "./lib/source-pin.mjs";

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
    } else if (a === "--tool") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out.missing = "--tool";
      else {
        out.flags.tool = next;
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
  return `sds w800-mcp-unpaid — unpaid tools/list + safe tools/call isError, bound to committed MCP source

Commands:
  tools/list              pin source sha + initialize + tools/list against fixture (or loopback --origin)
  tools/call [tool]       unpaid free-tool call against fixture; assert isError (exit 0)
  run                     cold harness: unpaid list + isError call exit 0 + seeded refuses
  cite-apex               document live apex URL (read-only cite; no POST pay)

Seeded failures (exit ≠ 0, clear code, paymentSent=false, paidToolsCallPosted=false):
  --seeded-failure paid-tool-call
  --seeded-failure payment-signature
  --seeded-failure stripe-path
  --seeded-failure tools-sha-mismatch
  --seeded-failure paid-as-unpaid

Options:
  --origin URL            http loopback MCP origin only (default: spawned fixture)
  --tool NAME             free tool for isError demo (default: ${UNPAID_CALL_TOOL})
  --json / --pretty       JSON envelope on stdout
  --fixture PATH          load seeded fixture JSON
  --live                  refused (LIVE_REFUSE); live apex is cite-apex only

Apex five tools: ${MCP_TOOLS.join(", ")}
Default unpaid call tool: ${UNPAID_CALL_TOOL}
Free tools: ${FREE_TOOLS.join(", ")}
Paid (never POST): ${PAID_TOOL}
Pinned tools-block sha: ${PINNED_TOOLS_BLOCK_SHA256}
Never send: PAYMENT-SIGNATURE, X-PAYMENT, stripe-signature
`;
}

function pinEnvelopeError(e, command) {
  return envelope({
    ok: false,
    command,
    feature: FEATURE,
    status: e.code === "USAGE" ? "usage" : "fail",
    error: failError(e.code || "HOST_BUILD", e.message, {
      got: e.got,
      want: e.want,
    }),
    result: { refused: true, paymentSent: false, paidToolsCallPosted: false },
  });
}

function refuseEnvelope(command, e, extra = {}) {
  return envelope({
    ok: false,
    command,
    feature: FEATURE,
    status:
      e.code === "USAGE"
        ? "usage"
        : e.code === "PAID_REFUSE" ||
            e.code === "LIVE_REFUSE" ||
            e.code === "STRIPE_PATH_REFUSE" ||
            e.code === "PAYMENT_HEADER_REFUSE"
          ? "fail"
          : "fail",
    error: failError(e.code || "USAGE", e.message, {
      tool: e.tool,
      origin: e.origin,
      path: e.path,
      header: e.header,
    }),
    result: {
      refused: true,
      paymentSent: false,
      paidToolsCallPosted: false,
      neverPostedCall: true,
      ...extra,
    },
  });
}

async function withMcpTarget({ origin, live, command }, fn) {
  if (live) {
    try {
      refuseLiveFlag();
    } catch (e) {
      return refuseEnvelope(command, e, { live: true });
    }
  }
  if (origin && looksLikePaymentUrl(origin)) {
    return refuseEnvelope(
      command,
      Object.assign(new Error(`refusing Stripe/checkout path in unpaid harness: ${origin}`), {
        code: "STRIPE_PATH_REFUSE",
        path: origin,
      }),
      { path: origin, neverOpenedCheckout: true },
    );
  }

  let handle = null;
  let mcpUrl;
  let source;
  try {
    if (origin) {
      try {
        mcpUrl = resolveLoopbackMcpUrl(origin);
      } catch (e) {
        return refuseEnvelope(command, e, { origin, path: e.path });
      }
      source = "origin";
    } else {
      handle = await startFixtureServer();
      mcpUrl = handle.url;
      source = "fixture";
    }
    return await fn({ mcpUrl, source });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function assertListedFive(listed, pin) {
  const names = toolNames(listed);
  const missing = MCP_TOOLS.filter((n) => !names.includes(n));
  if (missing.length) {
    const err = new Error("missing required MCP tool");
    err.code = "SEED_REJECT";
    err.detail = { missing, names };
    throw err;
  }
  const inventoryMissing = pin.names.filter((n) => !names.includes(n));
  if (inventoryMissing.length || pin.names.length !== names.length) {
    const err = new Error("listed tools do not match committed inventory");
    err.code = "SEED_REJECT";
    err.detail = { listed: names, inventory: pin.names };
    throw err;
  }
  return names;
}

function assertInitOk(initialize) {
  const protocol = initialize.json?.result?.protocolVersion;
  const info = initialize.json?.result?.serverInfo;
  if (initialize.status !== 200) {
    const err = new Error("MCP HTTP non-200");
    err.code = "HOST_BUILD";
    err.detail = { initialize: initialize.status };
    throw err;
  }
  if (protocol !== MCP_PROTOCOL) {
    const err = new Error(`protocol must be ${MCP_PROTOCOL}`);
    err.code = "HOST_BUILD";
    err.detail = { protocol };
    throw err;
  }
  if (info?.name !== MCP_SERVER_INFO.name) {
    const err = new Error("unexpected serverInfo");
    err.code = "HOST_BUILD";
    err.detail = { info };
    throw err;
  }
  return { protocol, info };
}

async function runList({ origin, live }) {
  const evidence = [
    {
      kind: "argv",
      argv: ["initialize", "tools/list"],
      note: "unpaid list; never PAYMENT-SIGNATURE; never paid tools/call",
    },
  ];

  let pin;
  try {
    pin = assertSourcePin();
  } catch (e) {
    return pinEnvelopeError(e, "tools/list");
  }
  evidence.push({
    kind: "source-pin",
    source: pin.mcpPath,
    sha256: pin.sha256,
    names: pin.names,
    negotiationSha: pin.negotiationSha,
  });

  return withMcpTarget({ origin, live, command: "tools/list" }, async ({ mcpUrl, source }) => {
    evidence.push({ kind: "mcp-url", url: mcpUrl, source });
    const session = await listTools(mcpUrl);
    let protocol;
    let info;
    let names;
    try {
      ({ protocol, info } = assertInitOk(session.initialize));
      if (session.listed.status !== 200) {
        const err = new Error("MCP HTTP non-200");
        err.code = "HOST_BUILD";
        err.detail = { initialize: session.initialize.status, list: session.listed.status };
        throw err;
      }
      names = assertListedFive(session.listed, pin);
    } catch (e) {
      return envelope({
        ok: false,
        command: "tools/list",
        feature: FEATURE,
        evidence,
        error: failError(e.code || "HOST_BUILD", e.message, e.detail),
        result: { paymentSent: false, paidToolsCallPosted: false },
      });
    }

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

    return envelope({
      ok: true,
      command: "tools/list",
      feature: FEATURE,
      evidence,
      boundary: { unpaidSafeCallPosted: false },
      result: {
        tools: names,
        protocol,
        serverInfo: info,
        listedBeforeCall: true,
        unpaidSafeCallPosted: false,
        paymentSent: false,
        paidToolsCallPosted: false,
        source,
        mcpUrl,
        paidToolListedNotCalled: PAID_TOOL,
        toolsBlockSha256: pin.sha256,
        shippedProcessCite: "server/index.js → server/routes/mcp.js",
        wave: "w800",
      },
    });
  });
}

async function runUnpaidIsErrorCall({ origin, tool, live }) {
  const toolName = tool || UNPAID_CALL_TOOL;
  const evidence = [
    {
      kind: "argv",
      argv: ["tools/call", toolName],
      note: "unpaid tools/list then tools/call → assert MCP isError; never PAYMENT-SIGNATURE; never paid tool POST",
    },
  ];

  let pin;
  try {
    pin = assertSourcePin();
    if (live) refuseLiveFlag();
    assertUnpaidCallAllowed("tools/call", { name: toolName, arguments: {} });
  } catch (e) {
    return refuseEnvelope("tools/call", e, { tool: e.tool || toolName });
  }
  evidence.push({
    kind: "source-pin",
    source: pin.mcpPath,
    sha256: pin.sha256,
    names: pin.names,
  });

  return withMcpTarget({ origin, live: false, command: "tools/call" }, async ({ mcpUrl, source }) => {
    evidence.push({ kind: "mcp-url", url: mcpUrl, source });
    const session = await callUnpaidTool(mcpUrl, toolName, {});
    let protocol;
    let info;
    let names;
    let shape;
    try {
      ({ protocol, info } = assertInitOk(session.initialize));
      if (!session.listed || session.listed.status !== 200 || !session.called || session.called.status !== 200) {
        const err = new Error("MCP HTTP non-200");
        err.code = "HOST_BUILD";
        err.detail = {
          initialize: session.initialize.status,
          list: session.listed?.status ?? null,
          call: session.called?.status ?? null,
        };
        throw err;
      }
      names = assertListedFive(session.listed, pin);
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
          paidToolsCallPosted: false,
          isError: session.called?.json?.result?.isError,
        },
      });
    }

    evidence.push({
      kind: "http",
      initialize: { status: session.initialize.status, protocol, serverInfo: info },
      list: { status: session.listed.status, tools: names },
      call: { status: session.called.status, tool: toolName },
    });
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
      boundary: { unpaidSafeCallPosted: true },
      result: {
        tool: toolName,
        isError: true,
        content: shape.content,
        text: shape.text,
        tools: names,
        listedBeforeCall: true,
        protocol,
        serverInfo: info,
        paymentSent: false,
        paidToolsCallPosted: false,
        unpaidSafeCallPosted: true,
        source,
        mcpUrl,
        paidToolListedNotCalled: PAID_TOOL,
        toolsBlockSha256: pin.sha256,
        shippedProcessCite: "server/index.js → server/routes/mcp.js",
        wave: "w800",
      },
    });
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
    toolsBlockSha256: listEnv.result?.toolsBlockSha256,
    paymentSent: listEnv.boundary?.paymentSent,
  });

  const callEnv = await runUnpaidIsErrorCall({ tool: UNPAID_CALL_TOOL });
  steps.push({
    step: "unpaid-tools-call-isError",
    ok: callEnv.ok,
    exit: exitFor(callEnv),
    tool: callEnv.result?.tool,
    isError: callEnv.result?.isError,
    listedBeforeCall: callEnv.result?.listedBeforeCall,
    paymentSent: callEnv.boundary?.paymentSent,
    paidToolsCallPosted: callEnv.boundary?.paidToolsCallPosted,
  });

  const seeds = [
    "paid-tool-call",
    "payment-signature",
    "stripe-path",
    "tools-sha-mismatch",
    "paid-as-unpaid",
  ];
  for (const id of seeds) {
    const env = runSeeded(
      id,
      id === "stripe-path"
        ? { path: "/api/checkout" }
        : id === "paid-as-unpaid"
          ? {
              claim: {
                tool: PAID_TOOL,
                isError: false,
                paid: false,
                licensePresented: false,
              },
            }
          : {},
    );
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

  const listOk = listEnv.ok === true && exitFor(listEnv) === 0;
  const callOk =
    callEnv.ok === true &&
    exitFor(callEnv) === 0 &&
    callEnv.result?.isError === true &&
    callEnv.boundary?.paymentSent === false &&
    callEnv.boundary?.paidToolsCallPosted === false;
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
    ok: listOk && callOk && seedsOk,
    command: "run",
    feature: FEATURE,
    evidence: [{ kind: "harness-steps", steps }],
    error:
      listOk && callOk && seedsOk
        ? null
        : failError("HARNESS_FAIL", "cold harness failed unpaid list/isError or seeded refuse", {
            steps,
          }),
    result: {
      listOk,
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

function normalizeTokens(tokens) {
  if (tokens[0] === "tools/list") return ["tools", "list", ...tokens.slice(1)];
  if (tokens[0] === "tools/call") return ["tools", "call", ...tokens.slice(1)];
  return tokens;
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

  if (parsed.flags.license) {
    const env = refuseEnvelope(
      parsed.tokens[0] || "tools/call",
      Object.assign(new Error("refusing tools/call that presents a Stripe license argument"), {
        code: "PAID_REFUSE",
        tool: parsed.flags.tool || PAID_TOOL,
      }),
      { tool: parsed.flags.tool || PAID_TOOL },
    );
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
          "expected tools/list | tools/call | run | --seeded-failure <id>",
        ),
      });
    } else {
      const tokens = normalizeTokens(parsed.tokens);
      if (tokens[0] === "cite-apex" || tokens[0] === "cite") {
        env = envelope({
          ok: true,
          command: "cite-apex",
          feature: FEATURE,
          result: {
            url: `${APEX_ORIGIN}/mcp`,
            tools: [...MCP_TOOLS],
            unpaidCallTool: UNPAID_CALL_TOOL,
            freeTools: [...FREE_TOOLS],
            paidToolNeverPosted: PAID_TOOL,
            note: "Live apex cited read-only; cold proof uses loopback fixture unpaid tools/list + tools/call → isError. Never POST payment.",
            paymentSent: false,
            paidToolsCallPosted: false,
            toolsBlockSha256: PINNED_TOOLS_BLOCK_SHA256,
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
      } else if (tokens[0] === "tools" && (tokens[1] == null || tokens[1] === "list")) {
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
            "w800-mcp-unpaid tools/list | tools/call | run | --seeded-failure <id>",
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
