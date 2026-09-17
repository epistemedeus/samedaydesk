import { envelope, failError } from "./envelope.mjs";
import { FEATURES, PACKS, SEEDED } from "./catalog.mjs";
import { runArchive } from "./archive.mjs";
import { runFetch } from "./fetch.mjs";
import { runMcp } from "./mcp.mjs";
import { runPack } from "./pack.mjs";
import { runPresence } from "./presence.mjs";
import { withHost } from "./serve.mjs";
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
    if (spec.path === "/api/health" && !inner.flags.origin) {
      if (ctx.dryRun) {
        inner.flags.origin = "http://127.0.0.1:0";
        const routes = await runRoutes(ctx);
        const fetched = await runFetch(inner, ctx);
        return {
          ...fetched,
          command: "prove",
          feature: id,
          dryRun: true,
          evidence: [...(routes.evidence || []), ...(fetched.evidence || [])],
          result: { would: ["node server/index.js", "routes", "GET /api/health"] },
        };
      }
      try {
        return await withHost(ctx.root, async (handle) => {
          inner.flags.origin = handle.origin;
          const routes = await runRoutes(ctx);
          if (!routes.ok) return { ...routes, command: "prove", feature: id };
          const fetched = await runFetch(inner, ctx);
          return {
            ...fetched,
            command: "prove",
            feature: id,
            evidence: [...(routes.evidence || []), ...(fetched.evidence || [])],
            result: {
              serve: {
                origin: handle.origin,
                health: handle.health?.json,
                status: handle.health?.status,
              },
              fetch: fetched.result,
              routes: routes.result,
            },
          };
        });
      } catch (error) {
        return envelope({
          ok: false,
          command: "prove",
          feature: id,
          error: failError("HOST_BUILD", error.message, error.detail),
        });
      }
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
