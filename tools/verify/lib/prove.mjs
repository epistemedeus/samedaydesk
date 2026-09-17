import { envelope, failError } from "./envelope.mjs";
import { FEATURES, PACKS, SEEDED } from "./catalog.mjs";
import { runArchive } from "./archive.mjs";
import { runFetch } from "./fetch.mjs";
import { runMcp } from "./mcp.mjs";
import { runPack } from "./pack.mjs";
import { runPresence } from "./presence.mjs";
import { runServe } from "./serve.mjs";
import { runRoutes } from "./routes.mjs";

export async function runProve(parsed, ctx) {
  const seededId = parsed.seededId;
  const id = parsed.flags.feature || parsed.tokens[0] || (parsed.seededFailure ? SEEDED[seededId || "sha-mismatch"]?.feature : null);
  if (!id) {
    return envelope({
      ok: false,
      command: "prove",
      status: "usage",
      error: failError("USAGE", `prove --feature <id>; known: ${Object.keys(FEATURES).join(", ")}`),
    });
  }
  const spec = FEATURES[id];
  if (!spec) {
    return envelope({
      ok: false,
      command: "prove",
      status: "usage",
      error: failError("USAGE", `unknown feature ${id}`),
    });
  }

  const inner = {
    ...parsed,
    command: spec.command,
    tokens: [],
    flags: { ...parsed.flags, feature: id },
  };

  let result;
  if (spec.command === "archive") {
    inner.tokens = [parsed.seededFailure ? "acquire" : spec.action || "acquire"];
    result = await runArchive(inner, ctx);
  } else if (spec.command === "mcp") {
    inner.tokens = ["tools", "list"];
    result = await runMcp(inner, ctx);
  } else if (spec.command === "fetch") {
    if (spec.target) inner.flags.target = spec.target;
    if (spec.path) inner.flags.path = spec.path;
    if (spec.path === "/api/health" && !inner.flags.origin && !ctx.dryRun) {
      const once = await runServe({ ...inner, tokens: ["once"] }, ctx);
      if (!once.ok) return { ...once, command: "prove", feature: id };
      const routes = await runRoutes(ctx);
      inner.flags.origin = once.result?.origin;
      const fetched = await runFetch(inner, ctx);
      return {
        ...fetched,
        command: "prove",
        feature: id,
        evidence: [...(routes.evidence || []), ...(fetched.evidence || [])],
        result: { serve: once.result, fetch: fetched.result, routes: routes.result },
      };
    }
    result = await runFetch(inner, ctx);
  } else if (spec.command === "presence") {
    inner.tokens = [spec.action || "cold-read"];
    result = await runPresence(inner, ctx);
  } else if (spec.command === "pack") {
    inner.tokens = ["run", spec.id];
    if (PACKS[spec.id]?.expectProductReject) inner.flags.expectProductReject = true;
    result = await runPack(inner, ctx);
  } else {
    return envelope({
      ok: false,
      command: "prove",
      feature: id,
      error: failError("USAGE", `feature ${id} has no driver`),
    });
  }
  return { ...result, command: "prove", feature: id };
}

export async function runSeeded(parsed, ctx) {
  const id = parsed.seededId || "sha-mismatch";
  const spec = SEEDED[id];
  if (!spec) {
    return envelope({
      ok: false,
      command: "seeded-failure",
      status: "usage",
      error: failError("USAGE", `unknown seeded failure ${id}`),
    });
  }
  const inner = { ...parsed, seededFailure: true, seededId: id, flags: { ...parsed.flags } };
  if (spec.command === "archive") {
    inner.command = "archive";
    inner.tokens = ["acquire"];
    return { ...(await runArchive(inner, ctx)), command: "seeded-failure", feature: spec.feature };
  }
  if (spec.command === "mcp") {
    inner.command = "mcp";
    inner.tokens = ["tools", "list"];
    return { ...(await runMcp(inner, ctx)), command: "seeded-failure", feature: spec.feature };
  }
  if (spec.command === "pack") {
    inner.command = "pack";
    inner.tokens = ["run", spec.packId];
    inner.childArgv = spec.argv || [];
    return { ...(await runPack(inner, ctx)), command: "seeded-failure", feature: spec.feature };
  }
  return envelope({
    ok: false,
    command: "seeded-failure",
    error: failError("USAGE", `seeded failure ${id} has no driver`),
  });
}
