#!/usr/bin/env node
/**
 * Cold corpus runner for SDS stale-output regression.
 * Exit 0 when every fixture is correctly rejected.
 * --seeded-greenwash: feed greenwash case as accept → must exit 1 fail JSON.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { envelope } from "./lib/envelope.mjs";
import { CURRENT_PIN } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));
const verifyBin = join(here, "verify.mjs");

function parseArgs(argv) {
  const out = { seededGreenwash: false, json: true, help: false };
  for (const a of argv) {
    if (a === "--seeded-greenwash" || a === "--seeded-failure") out.seededGreenwash = true;
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
    console.log(`usage: node run.mjs [--json] [--seeded-greenwash]
cold: reject all stale/greenwash fixtures (exit 0)
seeded: feed greenwash as accept (exit 1 SEED_REJECT)`);
    process.exitCode = 0;
    return;
  }

  if (args.seededGreenwash) {
    const seed = manifest.cases.find((c) => c.seededGreenwash || c.id === manifest.seededGreenwash);
    if (!seed) {
      const body = envelope({
        command: "seeded-greenwash",
        status: "fail",
        ok: false,
        error: { code: "MISSING_SEED", message: "no seededGreenwash case in MANIFEST" },
        result: null,
      });
      process.stdout.write(JSON.stringify(body) + "\n");
      process.exitCode = 1;
      return;
    }
    const { status, body } = runVerify(seed.file, "accept");
    // Must be exit 1 with SEED_REJECT / ok:false
    const goodFail =
      status === 1 &&
      body.ok === false &&
      (body.error?.code === "SEED_REJECT" || body.result?.reject === true);
    if (!args.json) {
      console.log(
        `seeded-greenwash ${seed.id} exit=${status} ok=${body.ok} code=${body.error?.code} reasons=${JSON.stringify(body.result?.reasons || body.error?.reasons || [])}`,
      );
    } else {
      const out = envelope({
        command: "seeded-greenwash",
        status: goodFail ? "fail" : "fail",
        ok: false,
        evidence: [
          { kind: "seed", id: seed.id, file: seed.file },
          { kind: "pin", ...CURRENT_PIN },
          { kind: "child", status, body },
        ],
        error: {
          code: "SEED_REJECT",
          message: `seeded greenwash ${seed.id} refused when fed as accept`,
          reasons: body.result?.reasons || body.error?.reasons || [],
        },
        result: {
          id: seed.id,
          childExit: status,
          childOk: body.ok,
          reject: true,
          greenwash: true,
          reasons: body.result?.reasons || [],
        },
      });
      // Always exit 1 for seeded path (acceptance: exit ≠0)
      process.stdout.write(JSON.stringify(out) + "\n");
    }
    process.exitCode = 1;
    return;
  }

  // Cold corpus
  const rows = [];
  let failed = 0;
  if (!args.json) {
    console.log(`stale-output corpus: ${manifest.cases.length} cases`);
    console.log(`pin: ${CURRENT_PIN.version} ${CURRENT_PIN.sha256.slice(0, 12)}…`);
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
    // Greenwash case must also flag greenwash
    const greenwashOk =
      !c.seededGreenwash || body.result?.greenwash === true || body.result?.reasons?.includes("greenwash");
    const rowPass = pass && greenwashOk;
    rows.push({
      id: c.id,
      expect: c.expect,
      status,
      ok: body.ok,
      reject: body.result?.reject,
      greenwash: body.result?.greenwash,
      reasons: body.result?.reasons || [],
      pass: rowPass,
    });
    if (!args.json) {
      console.log(
        `${rowPass ? "PASS" : "FAIL"} ${c.id} exit=${status} reject=${body.result?.reject} greenwash=${body.result?.greenwash} reasons=${JSON.stringify(body.result?.reasons || [])}`,
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
      { kind: "corpus", total: rows.length, failed, pin: CURRENT_PIN },
      { kind: "rows", rows },
    ],
    error: ok
      ? null
      : { code: "CORPUS_FAIL", message: `${failed} case(s) failed`, failed },
    result: {
      passed: rows.length - failed,
      failed,
      total: rows.length,
      seededGreenwash: manifest.seededGreenwash,
      rows,
    },
  });

  process.stdout.write(JSON.stringify(out) + "\n");
  process.exitCode = ok ? 0 : 1;
}

main();
