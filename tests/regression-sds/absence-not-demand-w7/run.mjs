#!/usr/bin/env node
/**
 * Cold corpus runner for SDS absence≠demand regression (w7).
 * Exit 0 when every fixture is correctly rejected.
 * --seeded-absence-as-demand / --expect accept: feed seed as accept → must exit ≠0.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { interpretSpawn, VERIFY_TIMEOUT_MS } from "./lib/child.mjs";
import { envelope } from "./lib/envelope.mjs";
import { loadFixture } from "./lib/fixture.mjs";
import { PRINCIPLE } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));
const verifyBin = join(here, "verify.mjs");

function parseArgs(argv) {
  const out = {
    seededAbsenceAsDemand: false,
    json: true,
    help: false,
    fixture: null,
    usageError: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      a === "--seeded-absence-as-demand" ||
      a === "--seeded-failure" ||
      a === "--seeded-absence" ||
      a === "--as-accept"
    ) {
      out.seededAbsenceAsDemand = true;
    } else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--expect") {
      const v = argv[i + 1];
      if (v == null || v.startsWith("-")) {
        out.usageError = { code: "USAGE", message: "missing --expect value" };
      } else {
        i += 1;
        if (v !== "reject" && v !== "accept") {
          out.usageError = { code: "USAGE", message: `unknown --expect ${v}` };
        } else if (v === "accept") out.seededAbsenceAsDemand = true;
      }
    } else if (a === "--fixture") {
      const v = argv[i + 1];
      if (v == null || v.startsWith("-")) {
        out.usageError = { code: "USAGE", message: "missing --fixture value" };
      } else {
        i += 1;
        out.fixture = v;
      }
    } else if (a.startsWith("-")) {
      out.usageError = {
        code: a === "--live" ? "LIVE_FORBIDDEN" : "UNKNOWN_ARGUMENT",
        message: `unknown argument ${a}`,
      };
    } else if (!out.fixture) {
      out.fixture = a;
    } else {
      out.usageError = { code: "UNKNOWN_ARGUMENT", message: `unknown argument ${a}` };
    }
  }
  return out;
}

function runVerify(fixtureRel, expect) {
  const args = [verifyBin, "--json", "--fixture", fixtureRel, "--expect", expect];
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: here,
    timeout: VERIFY_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return interpretSpawn(r);
}

function writeFail(code, message, extra = {}) {
  const body = envelope({
    command: extra.command || "run",
    status: "fail",
    ok: false,
    error: { code, message },
    result: extra.result ?? null,
  });
  process.stdout.write(JSON.stringify(body) + "\n");
  process.exitCode = extra.exit ?? 2;
}

function resolveSeed(args) {
  if (args.fixture) {
    const { raw } = loadFixture(args.fixture);
    return { id: raw.id || args.fixture, file: args.fixture };
  }
  const seed = manifest.cases.find(
    (c) => c.seededAbsenceAsDemand || c.id === manifest.seededAbsenceAsDemand,
  );
  return seed || null;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`usage: node run.mjs [--json] [--seeded-absence-as-demand] [--expect accept|reject] [--fixture <path>]
cold: reject all absence-as-demand fixtures (exit 0)
seeded: feed absence-as-demand as accept (exit ≠0 SEED_REJECT)`);
    process.exitCode = 0;
    return;
  }
  if (args.usageError) {
    writeFail(args.usageError.code, args.usageError.message);
    return;
  }

  if (args.seededAbsenceAsDemand) {
    let seed;
    try {
      seed = resolveSeed(args);
    } catch (e) {
      writeFail(e.code || "FIXTURE_INVALID", e.message, { command: "seeded-absence-as-demand" });
      return;
    }
    if (!seed) {
      writeFail("MISSING_SEED", "no seededAbsenceAsDemand case in MANIFEST", {
        command: "seeded-absence-as-demand",
        exit: 1,
      });
      return;
    }
    const { status, body, timedOut } = runVerify(seed.file, "accept");
    const goodFail =
      !timedOut &&
      status === 1 &&
      body.ok === false &&
      body.error?.code === "SEED_REJECT";
    const agreedAccept =
      !timedOut && status === 0 && body.ok === true && body.result?.reject !== true;
    const errorCode = timedOut ? "ETIMEDOUT" : goodFail ? "SEED_REJECT" : agreedAccept ? "SEED_MISSED" : "SEED_ERROR";
    const out = envelope({
      command: "seeded-absence-as-demand",
      status: "fail",
      ok: false,
      evidence: [
        { kind: "seed", id: seed.id, file: seed.file },
        { kind: "principle", ...PRINCIPLE },
        { kind: "child", status, body, goodFail, timedOut: Boolean(timedOut) },
      ],
      error: {
        code: errorCode,
        message: goodFail
          ? `seeded absence-as-demand ${seed.id} refused when fed as accept`
          : agreedAccept
            ? `seeded accept agreed: ${seed.id} was not rejected as absence-as-demand`
            : `seeded absence-as-demand ${seed.id} did not produce SEED_REJECT`,
        reasons: body.result?.reasons || body.error?.reasons || [],
      },
      result: {
        id: seed.id,
        childExit: status,
        childOk: body.ok,
        reject: body.result?.reject === true,
        absenceAsDemand: body.result?.absenceAsDemand === true,
        reasons: body.result?.reasons || [],
      },
    });
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exitCode = 1;
    return;
  }

  const cases = args.fixture ? [{ id: args.fixture, file: args.fixture, expect: "reject" }] : manifest.cases;
  if (args.fixture) {
    try {
      loadFixture(args.fixture);
    } catch (e) {
      writeFail(e.code || "FIXTURE_INVALID", e.message);
      return;
    }
  }

  const rows = [];
  let failed = 0;
  if (!args.json) {
    console.log(`absence-not-demand-w7 corpus: ${cases.length} cases`);
    console.log(`principle: ${PRINCIPLE.statement}`);
    console.log("---");
  }

  for (const c of cases) {
    const { status, body, timedOut } = runVerify(c.file, "reject");
    const pass =
      !timedOut &&
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
      timedOut: Boolean(timedOut),
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
