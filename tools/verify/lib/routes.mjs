import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { envelope, failError } from "./envelope.mjs";
import { FOR_AGENTS_PAGES, PROTOCOL_ROUTES, X402_PAGES } from "./catalog.mjs";

export async function loadSpaPaths(root) {
  const moduleUrl = pathToFileURL(join(root, "server/lib/spa-route-shells.js")).href;
  const mod = await import(moduleUrl);
  const shells = Array.isArray(mod.SPA_ROUTE_SHELLS) ? mod.SPA_ROUTE_SHELLS : [];
  return shells.map((row) => row.path);
}

export async function runRoutes({ root, dryRun = false } = {}) {
  const extra = [...PROTOCOL_ROUTES, ...X402_PAGES, ...FOR_AGENTS_PAGES];
  if (dryRun) {
    return envelope({
      ok: true,
      command: "routes",
      dryRun: true,
      evidence: [{ kind: "argv", argv: ["inspect", "server/lib/spa-route-shells.js"] }],
      result: { extra },
    });
  }
  try {
    const spa = await loadSpaPaths(root);
    const paths = [...new Set([...spa, ...extra])].sort();
    const missingX402 = X402_PAGES.filter((path) => !paths.includes(path));
    const missingUseful = paths.includes("/for-agents/useful-jobs") ? [] : ["/for-agents/useful-jobs"];
    const missingMcp = paths.includes("/mcp") ? [] : ["/mcp"];
    const evidence = [
      { kind: "spa-shells", count: spa.length, sample: spa.slice(0, 12) },
      { kind: "protocol", paths: PROTOCOL_ROUTES },
      { kind: "x402-pages", paths: X402_PAGES },
    ];
    if (missingX402.length || missingUseful.length) {
      return envelope({
        ok: false,
        command: "routes",
        evidence,
        error: failError("HOST_BUILD", "required public routes missing from shells", {
          missingX402,
          missingUseful,
        }),
      });
    }
    return envelope({
      ok: true,
      command: "routes",
      evidence,
      result: { paths, protocol: PROTOCOL_ROUTES, x402: X402_PAGES, mcp: missingMcp.length === 0 },
    });
  } catch (error) {
    return envelope({
      ok: false,
      command: "routes",
      status: "error",
      error: failError("RUNTIME", error.message),
    });
  }
}
