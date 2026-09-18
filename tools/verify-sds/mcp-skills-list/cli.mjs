#!/usr/bin/env node
/**
 * SDS MCP skills/list verifier (SEP-2640).
 * Boundary: tools/verify-sds/mcp-skills-list/** only.
 * Never Stripe/x402 spend, never PAYMENT-SIGNATURE, never tools/call.
 *
 * Usage:
 *   node tools/verify-sds/mcp-skills-list/cli.mjs skills/list [--json]
 *   node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure silent-empty-success [--json]
 *   node tools/verify-sds/mcp-skills-list/cli.mjs run [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APEX_ORIGIN,
  FEATURE,
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  PRESENCE_SKILLS_INDEX_REL,
  SEEDED,
  SKILL_NAMES,
} from "./lib/catalog.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import { listSkills } from "./lib/client.mjs";
import { acceptInitialize, acceptSkillsList } from "./lib/accept.mjs";
import { loadExpectedSkills, loadPresenceIndex, presenceNames } from "./lib/skills.mjs";
import { runSeeded } from "./lib/refuse.mjs";
import { REPO_ROOT } from "./lib/paths.mjs";

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
  return `sds mcp-skills-list — SEP-2640 skills/list (loopback fixture)

Commands:
  skills/list             initialize + skills/list against fixture (or --origin)
  skills/get ...          USAGE refuse (list-only cold run)
  tools/call ...          TOOLS_CALL_REFUSE (never paid Fix Pack / extract)
  run                     cold harness: skills/list exit 0 + seeded refuses
  cite-apex               document live apex URL (read-only cite; no POST pay)

Seeded failures (exit ≠ 0, clear code, paymentSent=false, toolsCalled=false):
  --seeded-failure silent-empty-success
  --seeded-failure missing-skill
  --seeded-failure digest-mismatch
  --seeded-failure tools-call
  --seeded-failure protocol-2026-07-28-only

Options:
  --origin URL            MCP base origin (default: loopback fixture)
  --live                  optional read-only cite of ${APEX_ORIGIN}/mcp (no call)
  --json / --pretty       JSON envelope on stdout
  --fixture PATH          load seeded fixture JSON

Required skills: ${SKILL_NAMES.join(", ")}
Protocol: ${MCP_PROTOCOL} (not 2026-07-28-only)
Never send: PAYMENT-SIGNATURE, X-PAYMENT, stripe-signature
Never POST: tools/call, /extract, /api/checkout
`;
}

async function runList({ origin, live }) {
  const evidence = [
    {
      kind: "argv",
      argv: ["initialize", "skills/list"],
      note: "SEP-2640 list-only; never tools/call; never PAYMENT-SIGNATURE",
    },
  ];

  let handle = null;
  let mcpUrl;
  let source;

  try {
    if (origin) {
      mcpUrl = origin.replace(/\/$/, "").endsWith("/mcp")
        ? origin.replace(/\/$/, "")
        : `${origin.replace(/\/$/, "")}/mcp`;
      source = "origin";
    } else if (live) {
      evidence.push({
        kind: "live-cite",
        url: `${APEX_ORIGIN}/mcp`,
        note: "optional read-only cite; harness proof uses loopback fixture. Live apex today is tools/list, not skills/list.",
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

    const expected = loadExpectedSkills();
    const session = await listSkills(mcpUrl);
    const initResult = session.initialize.json?.result;
    const listResult = session.listed.json?.result;

    evidence.push({
      kind: "http",
      initialize: {
        status: session.initialize.status,
        protocol: initResult?.protocolVersion,
        serverInfo: initResult?.serverInfo,
      },
      list: {
        status: session.listed.status,
        skillCount: Array.isArray(listResult?.skills) ? listResult.skills.length : 0,
      },
    });

    if (session.initialize.status !== 200 || session.listed.status !== 200) {
      return envelope({
        ok: false,
        command: "skills/list",
        feature: FEATURE,
        evidence,
        error: failError("HOST_BUILD", "MCP HTTP non-200", {
          initialize: session.initialize.status,
          list: session.listed.status,
        }),
      });
    }

    try {
      acceptInitialize(initResult);
    } catch (e) {
      return envelope({
        ok: false,
        command: "skills/list",
        feature: FEATURE,
        evidence,
        error: failError(e.code || "PROTOCOL_REFUSE", e.message, e.detail),
      });
    }

    let accepted;
    try {
      accepted = acceptSkillsList(listResult, expected);
    } catch (e) {
      return envelope({
        ok: false,
        command: "skills/list",
        feature: FEATURE,
        evidence,
        error: failError(e.code || "SEED_REJECT", e.message, e.detail),
        result: { names: accepted?.names, listedBeforeCall: true },
      });
    }

    const presence = loadPresenceIndex(REPO_ROOT);
    const presenceSkillNames = presenceNames(presence);
    if (presence && presenceSkillNames.join(",") !== SKILL_NAMES.join(",")) {
      return envelope({
        ok: false,
        command: "skills/list",
        feature: FEATURE,
        evidence,
        error: failError("MISSING_SKILL", "presence skills-index names drifted from catalog", {
          presence: presenceSkillNames,
          catalog: [...SKILL_NAMES],
        }),
      });
    }
    evidence.push({
      kind: "presence-index",
      path: PRESENCE_SKILLS_INDEX_REL,
      names: presenceSkillNames,
      matched: true,
    });
    evidence.push({
      kind: "mcp-skills",
      names: accepted.names,
      required: [...SKILL_NAMES],
      listedBeforeCall: true,
    });

    return envelope({
      ok: true,
      command: "skills/list",
      feature: FEATURE,
      evidence,
      result: {
        skills: accepted.skills,
        names: accepted.names,
        protocol: initResult.protocolVersion,
        serverInfo: initResult.serverInfo,
        extension: "io.modelcontextprotocol/skills",
        listedBeforeCall: true,
        toolsCalled: false,
        paymentSent: false,
        source,
        mcpUrl,
        presenceIndex: PRESENCE_SKILLS_INDEX_REL,
        shippedProcessCite: "server/index.js → server/routes/mcp.js (tools/list today; this pack proves skills/list)",
        sep: "SEP-2640",
      },
    });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function runCallRefuse(tokens) {
  const tool = tokens[2] || tokens.find((t) => t.includes("_")) || "generate_complete_fix_pack";
  return runSeeded("tools-call", { tool });
}

async function runColdHarness() {
  const steps = [];
  const listEnv = await runList({});
  steps.push({
    step: "skills-list",
    ok: listEnv.ok,
    exit: exitFor(listEnv),
    names: listEnv.result?.names,
  });

  const seeds = Object.keys(SEEDED);
  for (const id of seeds) {
    const env = runSeeded(id);
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
    .every(
      (s) =>
        s.ok === false &&
        s.exit !== 0 &&
        s.refused === true &&
        s.paymentSent === false &&
        s.toolsCalled === false,
    );

  return envelope({
    ok: listOk && seedsOk,
    command: "run",
    feature: FEATURE,
    evidence: [{ kind: "harness-steps", steps }],
    error:
      listOk && seedsOk
        ? null
        : failError("HARNESS_FAIL", "cold harness failed skills/list or seeded refuse", { steps }),
    result: {
      listOk,
      seedsOk,
      steps,
      names: listEnv.result?.names,
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
          "expected skills/list | run | --seeded-failure <id>",
          { knownSeeds: Object.keys(SEEDED) },
        ),
      });
    } else {
      let tokens = parsed.tokens;
      if (tokens[0] === "skills/list") tokens = ["skills", "list", ...tokens.slice(1)];
      if (tokens[0] === "skills/get") tokens = ["skills", "get", ...tokens.slice(1)];
      if (tokens[0] === "tools/call") tokens = ["tools", "call", ...tokens.slice(1)];

      if (tokens[0] === "cite-apex" || tokens[0] === "cite") {
        env = envelope({
          ok: true,
          command: "cite-apex",
          feature: FEATURE,
          result: {
            url: `${APEX_ORIGIN}/mcp`,
            protocol: MCP_PROTOCOL,
            serverInfo: MCP_SERVER_INFO,
            skills: [...SKILL_NAMES],
            note: "Live apex cited read-only (tools/list today). Cold proof uses loopback skills/list fixture. Never POST payment.",
            toolsCalled: false,
            paymentSent: false,
          },
        });
      } else if (tokens[0] === "tools" && tokens[1] === "call") {
        env = runCallRefuse(tokens);
      } else if (tokens[0] === "skills" && tokens[1] === "get") {
        env = envelope({
          ok: false,
          command: "skills/get",
          status: "usage",
          error: failError("USAGE", "cold run is skills/list; skills/get is not required for listing"),
        });
      } else if (
        (tokens[0] === "skills" && (tokens[1] == null || tokens[1] === "list")) ||
        tokens[0] === "list"
      ) {
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
            "mcp-skills-list skills/list | run | --seeded-failure <id>",
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
