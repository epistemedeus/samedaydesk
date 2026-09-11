#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadCorpus, loadPin, REPORT_SCHEMA } from "../lib/paths.mjs";
import { resolveEngine } from "../lib/engine.mjs";
import { runEngineCase, specifiedVsPin } from "../lib/replay.mjs";
import { checkWitnesses } from "../lib/instance.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function runReplay({ engineRoot, outDir } = {}) {
  const pin = loadPin();
  const corpus = loadCorpus();
  const env = { ...process.env };
  if (engineRoot) env.W5_M02_ENGINE_ROOT = engineRoot;
  const engine = resolveEngine({ env, pin });
  const dest = outDir || resolve(tmpdir(), "w5-m06-replay");
  mkdirSync(dest, { recursive: true });

  const cases = [];
  for (const entry of corpus.cases) {
    const witnesses = checkWitnesses(entry);
    const actual = runEngineCase(engine.bin, entry);
    const vsPin = specifiedVsPin(entry, actual);
    const pinMatch =
      actual.transportFailure !== true &&
      actual.ok === entry.pin.ok &&
      actual.refused === entry.pin.refused &&
      actual.exitCode === entry.pin.exitCode &&
      actual.breaking === entry.pin.breaking &&
      actual.usedClass === entry.pin.usedClass &&
      (entry.pin.code ? actual.code === entry.pin.code : true) &&
      (entry.pin.reason ? actual.reason === entry.pin.reason : true);
    cases.push({
      id: entry.id,
      specified: entry.specified,
      transport: entry.transport,
      finding: entry.finding || null,
      witnessesOk: witnesses.ok,
      witnessProblems: witnesses.problems || [],
      pin: entry.pin,
      actual: {
        exitCode: actual.exitCode,
        ok: actual.ok,
        refused: actual.refused,
        code: actual.code,
        status: actual.status,
        breaking: actual.breaking,
        unknown: actual.unknown,
        usedClass: actual.usedClass,
        reason: actual.reason,
        termsVersion: actual.termsVersion,
        transportFailure: actual.transportFailure,
      },
      pinMatch,
      specifiedVsPin: vsPin,
    });
  }

  const report = {
    schema: REPORT_SCHEMA,
    schemaVersion: 1,
    appId: "wave5-m06-schema-compatibility-corpus",
    purchaseAuthority: false,
    sold: false,
    customerBrief: false,
    payment: { settling: false, prototype: true, paid: false },
    specifiedDialect: pin.specified.dialect,
    engine: {
      bin: engine.bin,
      source: engine.source,
      sha: engine.sha,
      pinSha: engine.pinSha,
      owner: pin.engine.owner,
    },
    integrationBinding: {
      engineOwner: "W5-M02",
      catalogOwner: "W5-M01",
      remaining:
        "Replay is against Co10 94c7bfd. W5-M02 may amend tools/json-schema-webhook-drift/; re-run this corpus on that export. Do not treat this receipt as M02 behavior.",
    },
    counts: {
      cases: cases.length,
      pinMatch: cases.filter((row) => row.pinMatch).length,
      witnessesOk: cases.filter((row) => row.witnessesOk).length,
      specifiedAgree: cases.filter((row) => String(row.specifiedVsPin).startsWith("agree")).length,
      gaps: cases.filter((row) => String(row.specifiedVsPin).startsWith("gap")).length,
      transportFailures: cases.filter((row) => row.actual.transportFailure).length,
    },
    cases,
  };

  const jsonPath = resolve(dest, "replay-report.json");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ok: report.counts.transportFailures === 0, report, jsonPath, engine };
}

function usage() {
  return `W5-M06 independent JSON Schema compatibility corpus

Usage:
  node experiments/wave5/m06/bin/replay.mjs [--engine-root <dir>] [--out-dir <dir>]

Default engine is PIN Co10 94c7bfd via git worktree. Set W5_M02_ENGINE_ROOT to
replay a later M02 checkout. This CLI does not vendor the drift engine.
`;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  try {
    const result = runReplay({ engineRoot: args["engine-root"], outDir: args["out-dir"] });
    process.stdout.write(
      `${JSON.stringify({
        ok: result.ok,
        appId: result.report.appId,
        engineSha: result.report.engine.sha,
        engineSource: result.report.engine.source,
        cases: result.report.counts.cases,
        pinMatch: result.report.counts.pinMatch,
        gaps: result.report.counts.gaps,
        transportFailures: result.report.counts.transportFailures,
        out: result.jsonPath,
        purchaseAuthority: false,
        sold: false,
      })}\n`,
    );
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        refused: false,
        incomplete: true,
        error: String(err?.message || err),
        purchaseAuthority: false,
      })}\n`,
    );
    process.exit(1);
  }
}

const invoked = process.argv[1] && process.argv[1].endsWith("replay.mjs");
if (invoked) main();
