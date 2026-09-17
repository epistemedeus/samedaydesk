#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseArgv, usageText } from "./lib/argv.mjs";
import { emitEnvelope, envelope, exitFor, failError } from "./lib/envelope.mjs";
import { resolveRoot } from "./lib/repo.mjs";
import { SEEDED } from "./lib/catalog.mjs";
import { runDoctor } from "./lib/doctor.mjs";
import { runBuild } from "./lib/build.mjs";
import { runServe } from "./lib/serve.mjs";
import { runRoutes } from "./lib/routes.mjs";
import { runFetch } from "./lib/fetch.mjs";
import { runPack } from "./lib/pack.mjs";
import { runArchive } from "./lib/archive.mjs";
import { runOpenApi } from "./lib/openapi.mjs";
import { runMcp } from "./lib/mcp.mjs";
import { runPresence } from "./lib/presence.mjs";
import { runProve, runSeeded } from "./lib/prove.mjs";

async function runFixture(parsed, ctx) {
  const raw = parsed.flags.fixture;
  const path = isAbsolute(raw) ? raw : join(ctx.root, raw);
  if (!existsSync(path)) {
    return envelope({
      ok: false,
      command: parsed.command || "fixture",
      error: failError("USAGE", `fixture not found: ${raw}`),
    });
  }
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  const inner = {
    ...parsed,
    seededFailure: true,
    seededId: fixture.seededId || fixture.id || parsed.seededId,
    flags: { ...parsed.flags, ...fixture.flags },
  };
  if (fixture.seededId && SEEDED[fixture.seededId]) {
    inner.seededId = fixture.seededId;
    return runSeeded(inner, ctx);
  }
  if (fixture.command === "archive" || fixture.pack === "archive") {
    inner.command = "archive";
    inner.tokens = ["acquire"];
    return runArchive(inner, ctx);
  }
  if (fixture.command === "mcp") {
    inner.command = "mcp";
    inner.tokens = ["tools", "list"];
    return runMcp(inner, ctx);
  }
  if (fixture.command === "pack" || fixture.pack) {
    inner.command = "pack";
    inner.tokens = ["run", fixture.pack || fixture.id || "useful-jobs"];
    inner.childArgv = fixture.argv || inner.childArgv;
    return runPack(inner, ctx);
  }
  return envelope({
    ok: false,
    command: "fixture",
    error: failError("USAGE", "fixture must set seededId, command, or pack"),
  });
}

async function dispatch(parsed, ctx) {
  if (parsed.missingValues.length) {
    return envelope({
      ok: false,
      command: parsed.command || "unknown",
      status: "usage",
      error: failError("USAGE", `missing value for ${parsed.missingValues[0]}`),
    });
  }
  if (parsed.flags.fixture) return runFixture(parsed, ctx);

  if (parsed.help || parsed.command === "help") {
    process.stderr.write(usageText());
    return envelope({ ok: true, command: "help", dryRun: parsed.dryRun });
  }

  if (!parsed.command && parsed.seededFailure) {
    return runSeeded(parsed, ctx);
  }

  const command = parsed.command;
  if (!command) {
    process.stderr.write(usageText());
    return envelope({
      ok: false,
      command: "help",
      status: "usage",
      error: failError("USAGE", "missing command"),
    });
  }

  switch (command) {
    case "doctor":
      return runDoctor(ctx);
    case "build":
      return runBuild({ ...ctx, skipCi: Boolean(parsed.flags.skipCi) });
    case "serve":
      return runServe(parsed, ctx);
    case "routes":
      return runRoutes(ctx);
    case "fetch":
      return runFetch(parsed, ctx);
    case "pack":
      return runPack(parsed, ctx);
    case "archive":
      return runArchive(parsed, ctx);
    case "openapi":
      return runOpenApi(parsed, ctx);
    case "mcp":
      return runMcp(parsed, ctx);
    case "presence":
      return runPresence(parsed, ctx);
    case "prove":
      return runProve(parsed, ctx);
    default:
      return envelope({
        ok: false,
        command,
        status: "usage",
        error: failError("USAGE", `unknown command ${command}`),
      });
  }
}

async function main(argv) {
  const parsed = parseArgv(argv);
  const root = resolveRoot(parsed.root || parsed.flags.root);
  const ctx = { root, dryRun: parsed.dryRun };
  let env;
  try {
    env = await dispatch(parsed, ctx);
  } catch (error) {
    env = envelope({
      ok: false,
      command: parsed.command || "unknown",
      status: "error",
      dryRun: parsed.dryRun,
      error: failError("RUNTIME", error?.message || String(error)),
    });
  }
  env.dryRun = Boolean(ctx.dryRun);
  env.boundary = { paymentSent: false, toolsCalled: false };
  emitEnvelope(env, { pretty: parsed.pretty, root });
  return exitFor(env);
}

const code = await main(process.argv.slice(2));
process.exit(code);
