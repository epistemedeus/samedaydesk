#!/usr/bin/env node
/**
 * Cold corpus runner for SDS absence≠demand regression (w7).
 * Exit 0 when every fixture is correctly rejected.
 * --seeded-absence-as-demand: feed seed case as accept → must exit ≠0.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { envelope } from "./lib/envelope.mjs";
import { PRINCIPLE } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));
const verifyBin = join(here, "verify.mjs");

function parseArgs(argv) {
  const out = { seededAbsenceAsDemand: false, json: true, help: false };
  for (const a of argv) {
    if (
      a === "--seeded-absence-as-demand" ||
      a === "--seeded-failure" ||
      a === "--seeded-absence"
    ) {
      out.seededAbsenceAsDemand = true;
    } else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function runVerify(fixtureRel, expect) {
  const args = [verifyBin, "--json", "--fixture", fixtureRel, "--expect", expect];
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: here,
  });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim() || "{}");
  } catch {
    body = { ok: false, parseError: true, stdout: r.stdout, stderr: r.stderr };
  }
  return { status: r.status ?? 1, body, stderr: r.stderr };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`usage: node run.mjs [--json] [--seeded-absence-as-demand]
cold: reject all absence-as-demand fixtures (exit 0)
seeded: feed absence-as-demand as accept (exit ≠0 SEED_REJECT)`);
    process.exitCode = 0;
    return;
  }

  if (args.seededAbsenceAsDemand) {
    const seed = manifest.cases.find(
      (c) => c.seededAbsenceAsDemand || c.id === manifest.seededAbsenceAsDemand,
    );
    if (!seed) {
      const body = envelope({
        command: "seeded-absence-as-demand",
        status: "fail",
        ok: false,
        error: { code: "MISSING_SEED", message: "no seededAbsenceAsDemand case in MANIFEST" },
        result: null,
      });
      process.stdout.write(JSON.stringify(body) + "\n");
      process.exitCode = 1;
      return;
    }
    const { status, body } = runVerify(seed.file, "accept");
    const goodFail =
      status === 1 &&
      body.ok === false &&
      (body.error?.code === "SEED_REJECT" || body.result?.reject === true);
    const out = envelope({
      command: "seeded-absence-as-demand",
      status: "fail",
      ok: false,
      evidence: [
        { kind: "seed", id: seed.id, file: seed.file },
        { kind: "principle", ...PRINCIPLE },
        { kind: "child", status, body, goodFail },
      ],
      error: {
        code: "SEED_REJECT",
        message: `seeded absence-as-demand ${seed.id} refused when fed as accept`,
        reasons: body.result?.reasons || body.error?.reasons || [],
      },
      result: {
        id: seed.id,
        childExit: status,
        childOk: body.ok,
        reject: true,
        absenceAsDemand: true,
        reasons: body.result?.reasons || [],
      },
    });
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let failed = 0;
  if (!args.json) {
    console.log(`absence-not-demand-w7 corpus: ${manifest.cases.length} cases`);
    console.log(`principle: ${PRINCIPLE.statement}`);
    console.log("---");
  }

  for (const c of manifest.cases) {
    const { status, body } = runVerify(c.file, "reject");
    const pass =
      status === 0 &&
      body.ok === true &&
      body.result?.reject === true &&
      Array.isArray(body.result?.reasons) &&
      body.result.reasons.length > 0;
    const seedFlagOk =
      !c.seededAbsenceAsDemand ||
      body.result?.absenceAsDemand === true ||
      body.result?.reasons?.includes("absence_as_demand");
    const rowPass = pass && seedFlagOk;
    rows.push({
      id: c.id,
      expect: c.expect,
      status,
      ok: body.ok,
      reject: body.result?.reject,
      absenceAsDemand: body.result?.absenceAsDemand,
      reasons: body.result?.reasons || [],
      pass: rowPass,
    });
    if (!args.json) {
      console.log(
        `${rowPass ? "PASS" : "FAIL"} ${c.id} exit=${status} reject=${body.result?.reject} reasons=${JSON.stringify(body.result?.reasons || [])}`,
      );
    }
    if (!rowPass) failed += 1;
  }

  const ok = failed === 0;
  const out = envelope({
    command: "run",
    status: ok ? "pass" : "fail",
    ok,
    evidence: [
      { kind: "corpus", total: rows.length, failed, principle: PRINCIPLE },
      { kind: "rows", rows },
    ],
    error: ok ? null : { code: "CORPUS_FAIL", message: `${failed} case(s) failed`, failed },
    result: {
      passed: rows.length - failed,
      failed,
      total: rows.length,
      seededAbsenceAsDemand: manifest.seededAbsenceAsDemand,
      rows,
    },
  });

  process.stdout.write(JSON.stringify(out) + "\n");
  process.exitCode = ok ? 0 : 1;
}

main();
