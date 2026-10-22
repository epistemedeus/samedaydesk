#!/usr/bin/env node
/**
 * Cold corpus runner for SDS stale-archive reject regression (w8).
 * Exit 0 when SDS archive pins still hold and every fixture matches its expected verdict.
 * --seeded-stale-as-current / --seeded-failure: feed seed as accept → exit 1 SEED_REJECT.
 */
import { envelope } from "./lib/envelope.mjs";
import { loadManifest, loadFixture } from "./lib/catalog.mjs";
import { evaluateFixture } from "./lib/evaluate.mjs";
import { loadPins } from "./lib/pin.mjs";
import { PRINCIPLE, REFUSED_FLAGS } from "./lib/root.mjs";

const USAGE = `samedaydesk w8 stale-archive reject corpus

Usage:
  node tests/regression-sds/stale-archive-reject-w8/run.mjs [--json]
  node tests/regression-sds/stale-archive-reject-w8/run.mjs --seeded-stale-as-current [--json]
  node tests/regression-sds/stale-archive-reject-w8/run.mjs --seeded-failure [--json]
  node tests/regression-sds/stale-archive-reject-w8/run.mjs --list

Write boundary: tests/regression-sds/stale-archive-reject-w8/**. Does not pay Stripe/x402.
`;

function parseArgs(argv) {
  const out = {
    json: true,
    list: false,
    seededStaleAsCurrent: false,
    help: false,
    refused: null,
  };
  for (const a of argv) {
    if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (
      a === "--seeded-stale-as-current" ||
      a === "--seeded-failure" ||
      a === "--seeded-stale-archive"
    ) {
      out.seededStaleAsCurrent = true;
    } else if (REFUSED_FLAGS.includes(a) || a.startsWith("--pay") || a.startsWith("--stripe")) {
      out.refused = a;
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

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    const body = failEnvelope("run", { code: error.code || "BAD_ARGS", message: error.message });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 2;
    return;
  }

  if (args.refused) {
    const body = failEnvelope("run", {
      code: args.refused === "--live" ? "LIVE_REFUSE" : "PAY_REFUSE",
      message: `refused flag ${args.refused}`,
    });
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
        seededStaleAsCurrent: manifest.seededStaleAsCurrent,
        cases: manifest.cases.map((c) => ({
          id: c.id,
          expect: c.expect,
          class: c.class,
          seededStaleAsCurrent: Boolean(c.seededStaleAsCurrent),
        })),
      },
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 0;
    return;
  }

  const pins = loadPins();
  if (!pins.ok) {
    const body = failEnvelope("run", pins.error, {
      evidence: [{ kind: "pins", total: pins.total, failed: pins.failed, rows: pins.rows }],
      result: { pins: { ok: false, total: pins.total, failed: pins.failed } },
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.seededStaleAsCurrent) {
    const seed = manifest.cases.find(
      (c) => c.seededStaleAsCurrent || c.id === manifest.seededStaleAsCurrent,
    );
    if (!seed) {
      const body = failEnvelope("seeded-stale-as-current", {
        code: "MISSING_SEED",
        message: "no seededStaleAsCurrent case in MANIFEST",
      });
      process.stdout.write(`${JSON.stringify(body)}\n`);
      process.exitCode = 1;
      return;
    }
    const { raw } = loadFixture(seed.file);
    const evaluated = evaluateFixture(raw, "accept", pins);
    const rejected =
      evaluated.verdict.reject === true &&
      (evaluated.verdict.staleAsCurrent === true ||
        evaluated.result.reasons.includes("stale_as_current"));
    const body = envelope({
      command: "seeded-stale-as-current",
      status: "fail",
      ok: false,
      evidence: [
        { kind: "seed", id: seed.id, file: seed.file },
        { kind: "principle", ...PRINCIPLE },
        { kind: "pins", ok: true, total: pins.total, failed: 0 },
        {
          kind: "classification",
          reasons: evaluated.result.reasons,
          reject: evaluated.verdict.reject,
        },
        evaluated.probe
          ? {
              kind: "obtain-archive",
              ok: evaluated.probe.ok,
              refused: evaluated.probe.refused,
              code: evaluated.probe.code,
              childExit: evaluated.probe.childExit,
            }
          : null,
      ].filter(Boolean),
      error: rejected
        ? {
            code: "SEED_REJECT",
            message: `seeded stale-as-current ${seed.id} refused when fed as accept`,
            reasons: evaluated.result.reasons,
          }
        : {
            code: "SEED_NOT_REJECTED",
            message: `seeded stale-as-current ${seed.id} was not rejected when fed as accept`,
            reasons: evaluated.result.reasons,
          },
      result: {
        id: seed.id,
        childOk: evaluated.ok,
        reject: evaluated.verdict.reject,
        staleAsCurrent: evaluated.verdict.staleAsCurrent,
        reasons: evaluated.result.reasons,
        probe: evaluated.result.probe,
      },
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let failed = 0;
  if (!args.json) {
    console.log(`stale-archive-reject-w8 corpus: ${manifest.cases.length} cases`);
    console.log(`principle: ${PRINCIPLE.statement}`);
    console.log(`pins: ${pins.total} ok=${pins.ok} current=${pins.current.version}`);
    console.log("---");
  }

  for (const c of manifest.cases) {
    const { raw } = loadFixture(c.file);
    const evaluated = evaluateFixture(raw, c.expect, pins);
    const expectedReasonsOk =
      !Array.isArray(c.expectedReasons) ||
      c.expectedReasons.every((code) => evaluated.result.reasons.includes(code));
    const seedFlagOk =
      !c.seededStaleAsCurrent ||
      evaluated.verdict.staleAsCurrent === true ||
      evaluated.result.reasons.includes("stale_as_current");
    const rowPass = evaluated.ok && expectedReasonsOk && seedFlagOk;
    rows.push({
      id: c.id,
      expect: c.expect,
      ok: evaluated.ok,
      reject: evaluated.verdict.reject,
      staleAsCurrent: evaluated.verdict.staleAsCurrent,
      reasons: evaluated.result.reasons,
      probe: evaluated.result.probe,
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
      {
        kind: "pins",
        ok: true,
        total: pins.total,
        failed: 0,
        current: pins.current,
        negativeControl: pins.negativeControl
          ? { version: pins.negativeControl.version, sha256: pins.negativeControl.sha256 }
          : null,
      },
      { kind: "corpus", total: rows.length, failed, principle: PRINCIPLE },
      { kind: "rows", rows },
    ],
    error: ok ? null : { code: "CORPUS_FAIL", message: `${failed} case(s) failed`, failed },
    result: {
      passed: rows.length - failed,
      failed,
      total: rows.length,
      pinCount: pins.total,
      current: pins.current,
      seededStaleAsCurrent: manifest.seededStaleAsCurrent,
      rows,
    },
  });
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exitCode = ok ? 0 : 1;
}

try {
  main();
} catch (error) {
  const body = failEnvelope("run", { code: "UNCAUGHT", message: error.message });
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exitCode = 1;
}
