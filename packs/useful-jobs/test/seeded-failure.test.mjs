import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT, SEEDED_RUN_SKILL } from "../lib/paths.mjs";
import { parseSkillMarkdown } from "../lib/parse-skill.mjs";

const PROVE = join(PACK_ROOT, "bin/prove.mjs");

function runProve(args) {
  return spawnSync(process.execPath, [PROVE, ...args], {
    encoding: "utf8",
    cwd: join(PACK_ROOT, "../.."),
    maxBuffer: 4 * 1024 * 1024,
  });
}

test("seeded SKILL.md that advertises run is refused", () => {
  const md = readFileSync(SEEDED_RUN_SKILL, "utf8");
  const parsed = parseSkillMarkdown(md, {
    knownJobIds: ["lockfile-pin-delta"],
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "advertised-run");
  assert.match(parsed.error, /advertises run/);
});

test("prove --seeded-failure advertised-run exits 2", () => {
  const r = runProve(["--seeded-failure", "advertised-run"]);
  assert.equal(r.status, 2, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.code, "advertised-run");
  assert.match(body.error, /advertises run/);
  assert.equal(body.boundary.published, false);
  assert.equal(body.boundary.paymentSent, false);
});

test("prove --skill on the seeded file exits 2", () => {
  const r = runProve(["lint", "--skill", SEEDED_RUN_SKILL]);
  assert.equal(r.status, 2, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.code, "advertised-run");
});

test("prove --seeded-failure unknown-job quotes CLI refusal", () => {
  const r = runProve(["--seeded-failure", "unknown-job"]);
  assert.equal(r.status, 2, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.code, "unknown-job");
  assert.equal(body.childStatus, 2);
  assert.match(`${body.childStdout || ""}${body.childStderr || ""}`, /unknown job not-a-job/);
});
