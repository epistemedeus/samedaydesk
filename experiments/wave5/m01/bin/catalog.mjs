#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CatalogRefuse, firstOffer, loadCatalog, selectedEngines } from "../lib/catalog.mjs";
import { jobCatalogContract } from "../lib/contract.mjs";
import { invokeEngine } from "../lib/invoke.mjs";
import { D01_INJECTION } from "../lib/d01-adapter.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(token);
  }
  return out;
}

function usage() {
  return `w5-m01 useful-engine consumer

Commands:
  list
  contract
  describe <engine-id>
  run|invoke <engine-id> --out-dir DIR [--before PATH --after PATH --used PATH --job PATH --fields LIST --clock ISO --example]

Executes each selected engine's published CLI. Does not copy compare algorithms.
First offer: lockfile-pin-delta
Does not edit the live useful-jobs catalog or paid-useful-jobs wrapper.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

try {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(usage());
    process.exit(0);
  }

  const catalog = loadCatalog();

  if (cmd === "list") {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          schema: catalog.schema,
          firstOffer: catalog.firstOffer,
          source: catalog.source,
          selected: selectedEngines(catalog).map((engine) => ({
            id: engine.id,
            owner: engine.owner,
            pin: engine.pin.sha,
            source: engine.pin.source,
            firstOffer: engine.firstOffer === true,
          })),
          wrapperJobIds: catalog.wrapperPin.currentJobIds,
          liveSettlement: "out-of-scope",
          d01Binding: catalog.d01Binding.status,
          d01Injection: D01_INJECTION.status,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }

  if (cmd === "contract") {
    process.stdout.write(`${JSON.stringify(jobCatalogContract(catalog), null, 2)}\n`);
    process.exit(0);
  }

  if (cmd === "describe") {
    const id = args._[1] || catalog.firstOffer;
    const engine = catalog.engines.find((row) => row.id === id);
    if (!engine) {
      process.stdout.write(`${JSON.stringify({ ok: false, refused: true, code: "unknown-engine", error: id })}\n`);
      process.exit(2);
    }
    process.stdout.write(`${JSON.stringify({ ok: true, engine }, null, 2)}\n`);
    process.exit(0);
  }

  if (cmd !== "invoke" && cmd !== "run") {
    process.stderr.write(`unknown command ${cmd}\n`);
    process.stdout.write(usage());
    process.exit(2);
  }

  const engineId = args._[1] || firstOffer(catalog).id;
  if (!args["out-dir"]) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, refused: true, code: "missing-out-dir", error: "--out-dir is required" })}\n`,
    );
    process.exit(2);
  }
  const outDir = resolve(String(args["out-dir"]));
  const result = invokeEngine({
    engineId,
    outDir,
    example: args.example === true,
    mode: args.job && !args.before ? "job" : args.fields || args.clock ? "compare" : undefined,
    inputs: {
      before: args.before && !String(args.before).startsWith("http") ? resolve(String(args.before)) : args.before,
      after: args.after && !String(args.after).startsWith("http") ? resolve(String(args.after)) : args.after,
      used: args.used ? resolve(String(args.used)) : undefined,
      job: args.job ? resolve(String(args.job)) : undefined,
      fields: args.fields,
      clock: args.clock,
      maxBytes: args["max-bytes"],
      maxChanges: args["max-changes"],
      maxSources: args["max-sources"],
      maxStaleMs: args["max-stale-ms"],
      maxJsonDepth: args["max-json-depth"],
    },
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/catalog-receipt.json`, `${JSON.stringify(publicReceipt(result), null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(publicReceipt(result), null, 2)}\n`);
  process.exit(result.ok || result.outcome.kind === "refused" ? (result.ok ? 0 : 2) : 1);
} catch (err) {
  if (err instanceof CatalogRefuse) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, refused: true, code: err.code, error: err.message, detail: err.detail })}\n`,
    );
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify({ ok: false, code: "internal-error", error: String(err.message || err) })}\n`);
  process.exit(1);
}

function publicReceipt(result) {
  return {
    ok: result.ok,
    engineId: result.engineId,
    pinSha: result.pinSha,
    engineSource: result.engineSource,
    outcome: result.outcome,
    schemaMatch: result.schemaMatch,
    stdoutJson: result.stdoutJson,
    refuseJson: result.outcome.kind === "refused" ? result.refuseJson : undefined,
  };
}
