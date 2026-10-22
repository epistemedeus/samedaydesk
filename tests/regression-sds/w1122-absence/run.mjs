#!/usr/bin/env node
/**
 * Cold corpus runner for SDS absence≠demand regression (w1122).
 * Exit 0 when SDS pins still hold and every fixture matches its expected verdict.
 * --seeded-absence-as-demand / --seeded-failure: feed seed as accept → exit 1 SEED_REJECT.
 */
import { envelope } from "./lib/envelope.mjs";
import { loadManifest, loadFixture } from "./lib/catalog.mjs";
import { evaluateFixture } from "./lib/evaluate.mjs";
import { loadPins } from "./lib/pin.mjs";
import { PRINCIPLE } from "./lib/root.mjs";

const USAGE = `samedaydesk w1122 absence≠demand corpus

Usage:
  node tests/regression-sds/w1122-absence/run.mjs [--json]
  node tests/regression-sds/w1122-absence/run.mjs --seeded-absence-as-demand [--json]
  node tests/regression-sds/w1122-absence/run.mjs --seeded-failure [--json]
  node tests/regression-sds/w1122-absence/run.mjs --list

Write boundary: tests/regression-sds/w1122-absence/**. Does not pay Stripe/x402.
`;

function parseArgs(argv) {
  const out = {
    json: true,
    list: false,
    seededAbsenceAsDemand: false,
    help: false,
  };
  for (const a of argv) {
    if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (
      a === "--seeded-absence-as-demand" ||
      a === "--seeded-failure" ||
      a === "--seeded-absence"
    ) {
      out.seededAbsenceAsDemand = true;
    } else {
      const err = new Error(`unknown argument ${a}`);
      err.code = "unknown_flag";
      throw err;
    }
  }
  return out;
}

function failEnvelope(command, error, extra = {}) {
  return envelope({
    command,
    status: "fail",
    ok: false,
    error,
    result: extra.result || null,
    evidence: extra.evidence || [],
  });
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    const body = failEnvelope("run", { code: error.code || "BAD_ARGS", message: error.message });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    console.log(USAGE);
    process.exitCode = 0;
    return;
  }

  const manifest = loadManifest();

  if (args.list) {
    const body = envelope({
      command: "list",
      status: "pass",
      ok: true,
      result: {
        feature: manifest.feature,
        seededAbsenceAsDemand: manifest.seededAbsenceAsDemand,
        cases: manifest.cases.map((c) => ({
          id: c.id,
          expect: c.expect,
          class: c.class,
          seededAbsenceAsDemand: Boolean(c.seededAbsenceAsDemand),
        })),
      },
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 0;
    return;
  }

  const pins = await loadPins();
  if (!pins.ok) {
    const body = failEnvelope("run", pins.error, {
      evidence: [{ kind: "pins", total: pins.total, failed: pins.failed, rows: pins.rows }],
      result: { pins },
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.seededAbsenceAsDemand) {
    const seed = manifest.cases.find(
      (c) => c.seededAbsenceAsDemand || c.id === manifest.seededAbsenceAsDemand,
    );
    if (!seed) {
      const body = failEnvelope("seeded-absence-as-demand", {
        code: "MISSING_SEED",
        message: "no seededAbsenceAsDemand case in MANIFEST",
      });
      process.stdout.write(`${JSON.stringify(body)}\n`);
      process.exitCode = 1;
      return;
    }
    const { raw } = loadFixture(seed.file);
    const evaluated = evaluateFixture(raw, "accept");
    const body = envelope({
      command: "seeded-absence-as-demand",
      status: "fail",
      ok: false,
      evidence: [
        { kind: "seed", id: seed.id, file: seed.file },
        { kind: "principle", ...PRINCIPLE },
        { kind: "pins", ok: true, total: pins.total, failed: 0 },
        { kind: "classification", reasons: evaluated.result.reasons, reject: evaluated.verdict.reject },
      ],
      error: {
        code: "SEED_REJECT",
        message: `seeded absence-as-demand ${seed.id} refused when fed as accept`,
        reasons: evaluated.result.reasons,
      },
      result: {
        id: seed.id,
        childOk: evaluated.ok,
        reject: evaluated.verdict.reject,
        absenceAsDemand: evaluated.verdict.absenceAsDemand,
        reasons: evaluated.result.reasons,
      },
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let failed = 0;
  if (!args.json) {
    console.log(`absence-not-demand-w1122 corpus: ${manifest.cases.length} cases`);
    console.log(`principle: ${PRINCIPLE.statement}`);
    console.log(`pins: ${pins.total} ok=${pins.ok}`);
    console.log("---");
  }

  for (const c of manifest.cases) {
    const { raw } = loadFixture(c.file);
    const evaluated = evaluateFixture(raw, c.expect);
    const expectedReasonsOk =
      !Array.isArray(c.expectedReasons) ||
      c.expectedReasons.every((code) => evaluated.result.reasons.includes(code));
    const seedFlagOk =
      !c.seededAbsenceAsDemand ||
      evaluated.verdict.absenceAsDemand === true ||
      evaluated.result.reasons.includes("absence_as_demand");
    const rowPass = evaluated.ok && expectedReasonsOk && seedFlagOk;
    rows.push({
      id: c.id,
      expect: c.expect,
      ok: evaluated.ok,
      reject: evaluated.verdict.reject,
      absenceAsDemand: evaluated.verdict.absenceAsDemand,
      reasons: evaluated.result.reasons,
      pass: rowPass,
    });
    if (!args.json) {
      console.log(
        `${rowPass ? "PASS" : "FAIL"} ${c.id} expect=${c.expect} reject=${evaluated.verdict.reject} reasons=${JSON.stringify(evaluated.result.reasons)}`,
      );
    }
    if (!rowPass) failed += 1;
  }

  const ok = failed === 0;
  const body = envelope({
    command: "run",
    status: ok ? "pass" : "fail",
    ok,
    evidence: [
      { kind: "pins", ok: true, total: pins.total, failed: 0 },
      { kind: "corpus", total: rows.length, failed, principle: PRINCIPLE },
      { kind: "rows", rows },
    ],
    error: ok ? null : { code: "CORPUS_FAIL", message: `${failed} case(s) failed`, failed },
    result: {
      passed: rows.length - failed,
      failed,
      total: rows.length,
      pinCount: pins.total,
      seededAbsenceAsDemand: manifest.seededAbsenceAsDemand,
      rows,
    },
  });
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  const body = failEnvelope("run", { code: "UNCAUGHT", message: error.message });
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exitCode = 1;
});
