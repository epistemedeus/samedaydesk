import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MCP } from "../lib/pins.mjs";
import { envelope, failError } from "../lib/envelope.mjs";
import { digestResult, makeReceipt } from "../lib/receipt.mjs";
import { currentPin, inputDigestFor } from "../lib/stale.mjs";
import { rel } from "../lib/repo.mjs";

function fail(evidence, message, detail) {
  return envelope({
    ok: false,
    command: "run",
    job: "mcp",
    evidence,
    error: failError("MCP", message, detail),
  });
}

export async function runMcp(ctx) {
  const { root, dryRun = false, clock } = ctx;
  const evidence = [];
  const inventoryPath = rel(root, MCP.inventoryRel);
  const routePath = rel(root, MCP.routeRel);

  evidence.push({ kind: "pin", tools: [...MCP.tools], toolsCalled: false });

  if (dryRun) {
    return envelope({
      ok: true,
      command: "run",
      job: "mcp",
      dryRun: true,
      evidence: [
        ...evidence,
        { kind: "argv", argv: ["import", MCP.inventoryRel], note: "no HTTP, no tools/call" },
      ],
      result: { would: ["read MCP_TOOL_NAMES", "refuse tools/call"] },
    });
  }

  if (!existsSync(inventoryPath) || !existsSync(routePath)) {
    return fail(evidence, "shipped MCP inventory or route missing");
  }

  const source = readFileSync(inventoryPath, "utf8");
  if (/PAYMENT-SIGNATURE|X-PAYMENT/.test(source)) {
    return fail(evidence, "MCP inventory must not embed payment headers");
  }

  const mod = await import(pathToFileURL(inventoryPath).href);
  const names = [...(mod.MCP_TOOL_NAMES || [])];
  evidence.push({ kind: "inventory", path: MCP.inventoryRel, names });

  const expected = [...MCP.tools];
  if (names.length !== expected.length || expected.some((name, i) => names[i] !== name)) {
    return fail(evidence, "MCP tool inventory does not match the five shipped names", {
      expected,
      actual: names,
    });
  }

  const route = readFileSync(routePath, "utf8");
  for (const name of expected) {
    if (!route.includes(name)) {
      return fail(evidence, `server/routes/mcp.js does not mention ${name}`);
    }
  }
  evidence.push({ kind: "route", path: MCP.routeRel, mentionsAll: true, toolsCalled: false });

  const result = {
    tools: names,
    toolsCalled: false,
    protocolProbe: "inventory-only",
  };
  const receipt = makeReceipt({
    jobId: "mcp",
    clock,
    pin: currentPin(),
    inputDigest: inputDigestFor("mcp", root),
    resultDigest: digestResult(result),
    ok: true,
  });
  return envelope({
    ok: true,
    command: "run",
    job: "mcp",
    evidence,
    result,
    receipt,
  });
}
