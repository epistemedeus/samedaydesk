import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runCli, tmpOut } from "./helpers.mjs";

test("real SDS vuln-update: named resolved-source change, not a generic dependency list", () => {
  const outDir = tmpOut();
  const result = runCli(["run", "--journey", "sds-vuln-update", "--out-dir", outDir]);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.refused, false);
  assert.equal(result.json.transport.ok, true);
  assert.equal(result.json.analysis.outcome, "actionable");
  assert.equal(result.json.analysis.validRefusal, false);
  assert.equal(result.json.payment.purchaseAuthority, false);
  assert.equal(result.json.payment.fieldExecution, "not-performed");
  assert.equal(result.json.tested.engineSha, "e81efc8ab71b1bde88eca743d297149e61bbb6f2");
  assert.equal(result.json.tested.wrapperSha, "aeef964fa188443078958d9d6d393afae1d542ee");
  assert.equal(result.json.engine.counts.changed, 3);
  assert.equal(result.json.engine.counts.added, 0);
  assert.equal(result.json.engine.counts.removed, 0);

  const names = result.json.changed.map((p) => p.name).sort();
  assert.deepEqual(names, ["concurrently", "qs", "shell-quote"]);
  const qs = result.json.changed.find((p) => p.name === "qs");
  assert.equal(qs.before.version, "6.15.2");
  assert.equal(qs.after.version, "6.16.0");
  assert.equal(qs.before.resolved, "https://registry.npmjs.org/qs/-/qs-6.15.2.tgz");
  assert.equal(qs.after.resolved, "https://registry.npmjs.org/qs/-/qs-6.16.0.tgz");
  assert.notEqual(qs.before.integrity, qs.after.integrity);
  assert.ok(qs.changeKinds.includes("version"));
  assert.ok(qs.changeKinds.includes("integrity"));
  assert.ok(qs.changeKinds.includes("resolved"));
  assert.equal(qs.engineListed, true);

  const concurrently = result.json.changed.find((p) => p.name === "concurrently");
  assert.equal(concurrently.before.resolved, "https://registry.npmjs.org/concurrently/-/concurrently-10.0.3.tgz");
  assert.equal(concurrently.after.resolved, "https://registry.npmjs.org/concurrently/-/concurrently-10.0.5.tgz");

  const shell = result.json.changed.find((p) => p.name === "shell-quote");
  assert.equal(shell.before.version, "1.8.4");
  assert.equal(shell.after.version, "1.9.0");
  assert.equal(shell.before.resolved, "https://registry.npmjs.org/shell-quote/-/shell-quote-1.8.4.tgz");
  assert.equal(shell.after.resolved, "https://registry.npmjs.org/shell-quote/-/shell-quote-1.9.0.tgz");

  const md = readFileSync(join(outDir, "trial.md"), "utf8");
  assert.match(md, /qs/);
  assert.match(md, /qs-6\.16\.0\.tgz/);
  assert.equal(md.includes("express"), false);
  assert.equal(JSON.stringify(result.json.changed).includes("stripe"), false);
  assert.equal(existsSync(join(outDir, "pin-delta.json")), true);
  assert.equal(existsSync(join(outDir, "trial-result.json")), true);

  const engineArt = JSON.parse(readFileSync(join(outDir, "pin-delta.json"), "utf8"));
  assert.equal("resolved" in engineArt.changed[0].before, false);
  assert.equal(result.json.unlikeTerms.forcedEqual, false);
  assert.notEqual(result.json.unlikeTerms.pinTermsHash, result.json.unlikeTerms.disclosureHash);
  assert.notEqual(result.json.unlikeTerms.pinTermsHash, result.json.unlikeTerms.trialDigest);
});

test("self-compare of the current SDS lock is valid no-change or partial, not a crash", () => {
  const outDir = tmpOut();
  const result = runCli([
    "run",
    "--before-ref",
    "aeef964fa188443078958d9d6d393afae1d542ee",
    "--after-ref",
    "aeef964fa188443078958d9d6d393afae1d542ee",
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.transport.ok, true);
  assert.equal(result.json.engine.counts.changed, 0);
  assert.equal(result.json.engine.counts.added, 0);
  assert.equal(result.json.engine.counts.removed, 0);
  assert.ok(result.json.analysis.outcome === "no-change" || result.json.analysis.outcome === "partial");
  if (result.json.analysis.outcome === "no-change") {
    assert.equal(result.json.analysis.validNoChange, true);
  }
  assert.equal(result.json.refused, false);
  assert.equal(result.status, 0);
});
