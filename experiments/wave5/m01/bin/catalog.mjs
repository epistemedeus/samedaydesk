#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CatalogRefuse, firstOffer, loadCatalog, selectedEngines } from "../lib/catalog.mjs";
import { invokeEngine } from "../lib/invoke.mjs";

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
  return `w5-m01 engine catalog — thin invoker for D01

Commands:
  list
  describe <engine-id>
  invoke <engine-id> --out-dir DIR [--before PATH --after PATH --used PATH --job PATH --fields LIST --clock ISO --example]

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
          selected: selectedEngines(catalog).map((engine) => ({
            id: engine.id,
            owner: engine.owner,
            pin: engine.pin.sha,
            firstOffer: engine.firstOffer === true,
          })),
          wrapperJobIds: catalog.wrapperPin.currentJobIds,
          liveSettlement: "out-of-scope",
          d01Binding: catalog.d01Binding.status,
        },
        null,
        2,
      )}\n`,
    );
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

  if (cmd !== "invoke") {
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
    mode: args.job ? "job" : args.fields ? "compare" : undefined,
    inputs: {
      before: args.before ? resolve(String(args.before)) : undefined,
      after: args.after ? resolve(String(args.after)) : undefined,
      used: args.used ? resolve(String(args.used)) : undefined,
      job: args.job ? resolve(String(args.job)) : undefined,
      fields: args.fields,
      clock: args.clock,
      maxBytes: args["max-bytes"],
    },
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(joinWrite(outDir, "catalog-receipt.json"), `${JSON.stringify(publicReceipt(result), null, 2)}\n`);
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

function joinWrite(dir, name) {
  return `${dir}/${name}`;
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
