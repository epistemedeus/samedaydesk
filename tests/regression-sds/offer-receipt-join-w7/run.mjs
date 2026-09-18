#!/usr/bin/env node
/**
 * Cold offer-receipt join runner (W7).
 * Exit 0 when matching joins succeed and mismatch fixtures reject.
 * --seeded-mismatch: feed amount-mismatch as accept → must exit ≠0.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { envelope } from "./lib/envelope.mjs";
import { PRINCIPLE, SEEDED_MISMATCH_ID } from "./lib/pin.mjs";
import { refusedArgv } from "./lib/refuse.mjs";
import { seededMismatchOutcome } from "./lib/seeded.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));
const verifyBin = join(here, "verify.mjs");

function parseArgs(argv) {
  const out = { seededMismatch: false, json: true, help: false, cold: true };
  for (const a of argv) {
    if (
      a === "--seeded-mismatch" ||
      a === "--seeded-failure" ||
      a === "--seeded"
    ) {
      out.seededMismatch = true;
      out.cold = false;
    } else if (a === "--cold" || a === "--join") out.cold = true;
    else if (a === "--json") out.json = true;
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
    timeout: 30_000,
    killSignal: "SIGKILL",
  });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim() || "{}");
  } catch {
    body = { ok: false, parseError: true, stdout: r.stdout, stderr: r.stderr };
  }
  if (r.error || r.signal || r.status == null) {
    body = {
      ok: false,
      timedOut: r.signal === "SIGKILL" || r.error?.code === "ETIMEDOUT",
      signal: r.signal || null,
      error: r.error ? String(r.error.message || r.error) : null,
      stdout: r.stdout,
      stderr: r.stderr,
    };
  }
  return { status: r.status ?? 1, body, stderr: r.stderr };
}

function main(argv = process.argv.slice(2)) {
  const refused = refusedArgv(argv);
  if (refused.length) {
    const body = envelope({
      command: "run",
      status: "fail",
      ok: false,
      error: {
        code: "money_movement_refused",
        message: `refused flags: ${refused.join(" ")}`,
        flags: refused,
      },
      result: null,
    });
    process.stdout.write(JSON.stringify(body) + "\n");
    process.exitCode = 2;
    return;
  }

  const args = parseArgs(argv);
  if (args.help) {
    console.log(`usage: node run.mjs [--json] [--cold] [--seeded-mismatch]
cold join: matching SDS catalog offers join unsigned offer-receipts; mismatches reject (exit 0)
seeded mismatch: feed amount-mismatch as accept (exit ≠0 SEED_REJECT)`);
    process.exitCode = 0;
    return;
  }

  if (args.seededMismatch) {
    const seed = manifest.cases.find(
      (c) => c.seededMismatch || c.id === manifest.seededMismatch || c.id === SEEDED_MISMATCH_ID,
    );
    if (!seed) {
      const body = envelope({
        command: "seeded-mismatch",
        status: "fail",
        ok: false,
        error: { code: "MISSING_SEED", message: "no seededMismatch case in MANIFEST" },
        result: null,
      });
      process.stdout.write(JSON.stringify(body) + "\n");
      process.exitCode = 1;
      return;
    }
    const { status, body } = runVerify(seed.file, "accept");
    const outcome = seededMismatchOutcome({ status, body });
    const out = envelope({
      command: "seeded-mismatch",
      status: "fail",
      ok: false,
      evidence: [
        { kind: "seed", id: seed.id, file: seed.file },
        { kind: "principle", ...PRINCIPLE },
        { kind: "child", status, body },
      ],
      error: {
        code: outcome.code,
        message: `seeded mismatch ${seed.id} ${outcome.code === "SEED_REJECT" ? "refused when fed as accept" : "joined when fed as accept"}`,
        reasons: outcome.reasons,
      },
      result: {
        id: seed.id,
        childExit: status,
        childOk: body.ok === true,
        joined: body.result?.joined === true,
        reject: outcome.reject,
        mismatch: outcome.mismatch,
        reasons: outcome.reasons,
      },
    });
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let failed = 0;
  if (!args.json) {
    console.log(`offer-receipt-join-w7 corpus: ${manifest.cases.length} cases`);
    console.log(`principle: ${PRINCIPLE.statement}`);
    console.log("---");
  }

  for (const c of manifest.cases) {
    const expect = c.expect || "accept";
    const { status, body } = runVerify(c.file, expect);
    const pass = expect === "accept"
      ? status === 0 && body.ok === true && body.result?.joined === true
      : status === 0 && body.ok === true && body.result?.joined === false && (body.result?.reasons || []).length > 0;
    rows.push({
      id: c.id,
      expect,
      status,
      ok: body.ok,
      joined: body.result?.joined,
      mismatch: body.result?.mismatch,
      reasons: body.result?.reasons || [],
      pass,
    });
    if (!args.json) {
      console.log(
        `${pass ? "PASS" : "FAIL"} ${c.id} expect=${expect} exit=${status} joined=${body.result?.joined} reasons=${JSON.stringify(body.result?.reasons || [])}`,
      );
    }
    if (!pass) failed += 1;
  }

  const ok = failed === 0;
  const out = envelope({
    command: "cold-join",
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
      seededMismatch: manifest.seededMismatch,
      rows,
    },
  });

  if (args.json) process.stdout.write(JSON.stringify(out) + "\n");
  process.exitCode = ok ? 0 : 1;
}

main();
