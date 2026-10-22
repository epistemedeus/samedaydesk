#!/usr/bin/env node
/**
 * Cold corpus runner for SDS stale-output regression.
 * Exit 0 when every reject fixture is rejected and the current-pin control is accepted.
 * --seeded-greenwash / --seeded-failure: feed greenwash as accept → exit 1 SEED_REJECT.
 * --fixture that matches the claimed verdict → exit 1 SEED_MISS (no divergence).
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { envelope } from "./lib/envelope.mjs";
import { CURRENT_PIN } from "./lib/pin.mjs";
import { loadFixture, loadManifest } from "./lib/catalog.mjs";
import { CORPUS_ROOT } from "./lib/root.mjs";
import { childEnv } from "./lib/spawn-env.mjs";
import { classifyStaleOutput } from "./lib/classify.mjs";

const USAGE = `samedaydesk stale-output corpus

Usage:
  node tests/regression-sds/stale-output/run.mjs [--json]
  node tests/regression-sds/stale-output/run.mjs --seeded-greenwash [--json]
  node tests/regression-sds/stale-output/run.mjs --seeded-failure [--json]
  node tests/regression-sds/stale-output/run.mjs --fixture <path> [--expect reject|accept] [--json]
  node tests/regression-sds/stale-output/run.mjs --list

Write boundary: tests/regression-sds/stale-output/**. Does not pay Stripe/x402.
`;

function usageError(code, message) {
  const err = new Error(message);
  err.code = code;
  err.usage = true;
  return err;
}

function parseArgs(argv) {
  const out = {
    json: true,
    list: false,
    seededGreenwash: false,
    fixture: null,
    expect: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--seeded-greenwash" || a === "--seeded-failure") out.seededGreenwash = true;
    else if (a === "--fixture") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw usageError("missing_operand", "--fixture requires a path");
      out.fixture = next;
      i += 1;
    } else if (a === "--expect") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw usageError("missing_operand", "--expect requires reject|accept");
      out.expect = next;
      i += 1;
    } else {
      throw usageError("unknown_flag", `unknown argument ${a}`);
    }
  }
  if (out.expect && out.expect !== "reject" && out.expect !== "accept") {
    throw usageError("bad_expect", "--expect must be reject|accept");
  }
  return out;
}

function emit(body, json) {
  if (json) process.stdout.write(`${JSON.stringify(body)}\n`);
  else {
    const lines = [`samedaydesk stale-output  ${body.status}  ${body.command}`];
    for (const row of body.result?.rows || body.cases || []) {
      const mark = row.pass ? "ok" : "not ok";
      lines.push(`  ${mark}  ${row.id}  reject=${row.reject} reasons=${JSON.stringify(row.reasons || [])}`);
    }
    if (body.error) lines.push(`${body.error.code}: ${body.error.message}`);
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  if (json && body.error) process.stderr.write(`${body.error.code}: ${body.error.message}\n`);
}

function runVerify(fixtureRel, expect) {
  const args = [join(CORPUS_ROOT, "verify.mjs"), "--json", "--fixture", fixtureRel, "--expect", expect];
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: CORPUS_ROOT,
    env: childEnv(),
  });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim() || "{}");
  } catch {
    body = { ok: false, parseError: true, stdout: r.stdout, stderr: r.stderr };
  }
  return { status: r.status ?? 1, body, stderr: r.stderr };
}

function seededReport({ command, seed, claimed, observed, status, child }) {
  const diverged = claimed !== observed;
  const rejectedAsAccept = claimed === "accept" && observed === "reject";
  const code = diverged ? (rejectedAsAccept ? "SEED_REJECT" : "SEED_REJECT") : "SEED_MISS";
  const ok = false;
  const error = diverged
    ? {
        code,
        message: rejectedAsAccept
          ? `seeded greenwash ${seed.id} refused when fed as accept`
          : `seeded ${seed.id} claimed ${claimed}, product ${observed}`,
        reasons: child.body?.result?.reasons || child.body?.error?.reasons || [],
        kind: rejectedAsAccept ? "false_accept" : "diverged",
        id: seed.id,
      }
    : {
        code: "SEED_MISS",
        message: `seeded fixture ${seed.id} did not diverge from claimed verdict ${claimed}`,
        kind: "seed_miss",
        id: seed.id,
      };
  return envelope({
    command,
    status: "fail",
    ok,
    evidence: [
      { kind: "seed", id: seed.id, file: seed.file || seed.abs, claimed, observed },
      { kind: "pin", version: CURRENT_PIN.version, sha256: CURRENT_PIN.sha256, bytes: CURRENT_PIN.bytes },
      { kind: "child", status, body: child.body },
    ],
    error,
    result: {
      id: seed.id,
      childExit: status,
      childOk: child.body?.ok,
      reject: child.body?.result?.reject === true,
      greenwash: child.body?.result?.greenwash === true,
      reasons: child.body?.result?.reasons || [],
      claimedVerdict: claimed,
      observedVerdict: observed,
    },
    extra: seed.raw?.seededGreenwash || seed.seededGreenwash ? { seededGreenwash: seed.id } : {},
  });
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const body = envelope({
      command: "usage",
      status: "usage",
      ok: false,
      error: { code: err.code || "usage", message: err.message },
    });
    emit(body, true);
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    process.exitCode = 0;
    return;
  }

  const manifest = loadManifest();

  if (args.list) {
    for (const row of manifest.cases) {
      process.stdout.write(`${row.id}\t${row.surface || row.class}\t${row.expect}\n`);
    }
    process.exitCode = 0;
    return;
  }

  if (args.seededGreenwash || args.fixture) {
    const command = args.fixture ? "fixture" : "seeded-greenwash";
    let seed;
    if (args.fixture) {
      const loaded = loadFixture(args.fixture);
      seed = {
        id: loaded.raw.id,
        file: loaded.abs,
        expect:
          args.expect ||
          loaded.raw.claimedVerdict ||
          (loaded.raw.expectReject ? "reject" : "accept"),
        raw: loaded.raw,
      };
    } else {
      const row = manifest.cases.find((c) => c.seededGreenwash || c.id === manifest.seededGreenwash);
      seed = { ...row, expect: "accept" };
    }
    const claimed = args.expect || seed.expect || "accept";
    const child = args.fixture
      ? { status: null, body: null }
      : runVerify(seed.file, claimed);
    if (args.fixture) {
      const verdict = classifyStaleOutput(seed.raw.output, { surface: seed.raw.surface });
      const observed = verdict.reject ? "reject" : "accept";
      const diverged = claimed !== observed;
      const fakeChild = {
        status: diverged ? 1 : 0,
        body: envelope({
          command: "verify",
          status: diverged ? "fail" : "pass",
          ok: !diverged,
          error: null,
          result: {
            id: seed.id,
            reject: verdict.reject,
            greenwash: verdict.greenwash,
            reasons: verdict.reasons,
          },
        }),
      };
      const out = seededReport({
        command,
        seed,
        claimed,
        observed,
        status: fakeChild.status,
        child: fakeChild,
      });
      emit(out, args.json);
      process.exitCode = 1;
      return;
    }
    const observed = child.body?.result?.reject ? "reject" : "accept";
    const out = seededReport({
      command,
      seed,
      claimed,
      observed,
      status: child.status,
      child,
    });
    emit(out, args.json);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let failed = 0;
  for (const c of manifest.cases) {
    const { status, body } = runVerify(c.file, c.expect);
    const reject = body.result?.reject === true;
    const greenwash = body.result?.greenwash === true;
    const reasons = body.result?.reasons || [];
    let pass = false;
    if (c.expect === "reject") {
      pass = status === 0 && body.ok === true && reject && reasons.length > 0;
      if (c.seededGreenwash) pass = pass && (greenwash || reasons.includes("greenwash"));
    } else {
      pass = status === 0 && body.ok === true && reject === false && !greenwash;
    }
    rows.push({
      id: c.id,
      expect: c.expect,
      class: c.class,
      status,
      ok: body.ok,
      reject,
      greenwash,
      reasons,
      pass,
    });
    if (!pass) failed += 1;
  }

  const ok = failed === 0;
  const passed = rows.length - failed;
  const out = envelope({
    command: "run",
    status: ok ? "pass" : "fail",
    ok,
    evidence: [
      { kind: "corpus", total: rows.length, failed, pin: { version: CURRENT_PIN.version, sha256: CURRENT_PIN.sha256, bytes: CURRENT_PIN.bytes } },
      { kind: "rows", rows },
    ],
    error: ok ? null : { code: "CORPUS_FAIL", message: `${failed} case(s) failed`, failed },
    result: {
      passed,
      failed,
      total: rows.length,
      seededGreenwash: manifest.seededGreenwash,
      rows,
    },
    extra: {
      passed,
      failed,
      total: rows.length,
      seededGreenwash: manifest.seededGreenwash,
    },
  });
  emit(out, args.json);
  process.exitCode = ok ? 0 : 1;
}

main();
