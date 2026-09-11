import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseJsonLoose } from "../src/compare.mjs";
import { EXPECTED_SHAS, SHA_RE } from "../src/engines.mjs";
import { H04_ROOT } from "../src/paths.mjs";

const SDS52_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
const exampleDir = join(H04_ROOT, "examples", "api-routes", "h04-route-02");
const runDir = join(H04_ROOT, "runs", "sds52-api-upgrade", "h04-route-02");
const metaPath = join(runDir, "meta.json");
const examplePresent = ["before.yaml", "after.yaml", "used.json"].every((name) =>
  existsSync(join(exampleDir, name)),
);

test("SDS52 api-upgrade-brief pin is aeef964fa188443078958d9d6d393afae1d542ee", () => {
  assert.equal(EXPECTED_SHAS["sds52-paid-useful-jobs"], SDS52_SHA);
  assert.match(SDS52_SHA, SHA_RE);
});

test("SDS52 api-upgrade-brief h04-route-02 run meta exists or skip if example missing", (t) => {
  if (!examplePresent) {
    t.skip("h04-route-02 OpenAPI inputs missing; SDS52 run not invented");
    return;
  }
  assert.ok(existsSync(metaPath), "runs/sds52-api-upgrade/h04-route-02/meta.json");
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  assert.equal(meta.sha, SDS52_SHA);
  assert.match(String(meta.sha), SHA_RE);
  if (meta.executedSha) {
    assert.equal(meta.executedSha, SDS52_SHA);
  }
  assert.equal(meta.sample === true, false);
  const argv = Array.isArray(meta.argv) ? meta.argv.map(String) : [];
  assert.equal(argv.includes("--example"), false);
  assert.ok(argv.includes("api-upgrade-brief"));
  assert.ok(argv.includes("--funding"));
  assert.ok(argv.includes("unfunded"));
  assert.equal(meta.cwd, "/tmp/w5-h04/ro-sds52");

  const stdoutPath = join(runDir, "stdout.txt");
  const stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8") : "";
  const parsed = parseJsonLoose(stdout) || {};
  const refuseCode =
    meta.refuseCode ||
    meta.code ||
    parsed.code ||
    parsed.receipt?.code ||
    null;
  const ok = meta.ok === true && meta.exitCode === 0 && parsed.ok !== false;

  if (!ok) {
    assert.equal(typeof refuseCode, "string");
    assert.ok(refuseCode.length > 0, "refuse code recorded when engine did not succeed");
    assert.equal(meta.ok === true && meta.exitCode === 0, false);
    return;
  }

  assert.equal(meta.exitCode, 0);
  assert.equal(parsed.sold, false);
  assert.equal(parsed.sample, false);
  assert.equal(parsed.fundingState, "unfunded");
  const outDir = meta.outDir || join(runDir, "out");
  const briefJson = join(outDir, "upgrade-brief.json");
  const receipt = join(outDir, "receipt.json");
  assert.ok(existsSync(briefJson) || existsSync(receipt), "upgrade-brief or receipt recorded");
});
