import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const CLI = path.join(PKG, "bin/distribution-repair.mjs");
const CLOCK = "2026-09-10T20:15:00.000Z";

function run(args, cwd = PKG) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parse(stdout) {
  return JSON.parse(String(stdout).trim());
}

test("F1: colliding examples/ filename is not used when CWD lacks the file", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s206-f1-"));
  assert.ok(fs.existsSync(path.join(PKG, "examples/positive.json")));
  const r = run(["diagnose", "positive.json", "--clock", CLOCK], tmp);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = parse(r.stdout);
  assert.equal(out.refused, true);
  assert.equal(out.error.code, "missing-input");
  assert.equal(out.status, "malformed");
  assert.equal(out.diagnosis, undefined);
});

test("F1: --record missing in CWD does not fall back to examples", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s206-f1r-"));
  const input = path.join(tmp, "base.json");
  fs.copyFileSync(path.join(PKG, "examples/missing-record.json"), input);
  const man = path.join(tmp, "next.json");
  fs.writeFileSync(
    man,
    `${JSON.stringify({
      schema: "pilot.s185.distribution_repair_next_run.v1",
      inputs: { input: "base.json" },
      paidValueClaim: false,
    }, null, 2)}\n`,
  );
  assert.ok(fs.existsSync(path.join(PKG, "examples/positive.json")));
  const r = run(
    ["diagnose", "--from-next-run", man, "--record", "positive.json", "--clock", CLOCK],
    tmp,
  );
  const out = parse(r.stdout);
  assert.equal(out.refused, true);
  assert.equal(out.error.code, "missing-record");
});

test("F2: --write-next-run refuses input/symlink/hardlink/existing and preserves bytes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s206-f2-"));
  const input = path.join(tmp, "input.json");
  fs.copyFileSync(path.join(PKG, "examples/positive.json"), input);
  const orig = fs.readFileSync(input);

  const same = parse(
    run(["diagnose", input, "--clock", CLOCK, "--write-next-run", input], tmp).stdout,
  );
  assert.equal(same.nextRun.refused, true);
  assert.equal(same.nextRun.prep.code, "next-run-would-overwrite-input");
  assert.deepEqual(fs.readFileSync(input), orig);

  const link = path.join(tmp, "input-link.json");
  fs.symlinkSync(input, link);
  const sl = parse(
    run(["diagnose", input, "--clock", CLOCK, "--write-next-run", link], tmp).stdout,
  );
  assert.equal(sl.nextRun.refused, true);
  assert.deepEqual(fs.readFileSync(input), orig);

  const hl = path.join(tmp, "input-hl.json");
  fs.linkSync(input, hl);
  const hard = parse(
    run(["diagnose", input, "--clock", CLOCK, "--write-next-run", hl], tmp).stdout,
  );
  assert.equal(hard.nextRun.refused, true);
  assert.deepEqual(fs.readFileSync(input), orig);

  const existing = path.join(tmp, "already.json");
  fs.writeFileSync(existing, "keep-me\n");
  const ex = parse(
    run(["diagnose", input, "--clock", CLOCK, "--write-next-run", existing], tmp).stdout,
  );
  assert.equal(ex.nextRun.refused, true);
  assert.equal(ex.nextRun.prep.code, "next-run-path-exists");
  assert.equal(fs.readFileSync(existing, "utf8"), "keep-me\n");

  const distinct = path.join(tmp, "next.json");
  const ok = parse(
    run(["diagnose", input, "--clock", CLOCK, "--write-next-run", distinct], tmp).stdout,
  );
  assert.equal(ok.nextRun.refused, undefined);
  assert.ok(fs.existsSync(distinct));
  assert.deepEqual(fs.readFileSync(input), orig);
});
