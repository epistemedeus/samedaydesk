#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { root, readJson, writeJson, hashFile, run, requireSuccess, parseOptions } from "../lib/runtime.mjs";
import { acquireRelease, exportCandidate } from "../lib/acquire.mjs";
import { manifest, pairRoot, evaluateWitnesses, writeRegression } from "../lib/witness.mjs";

function engineRun(cli, prefix, before, after, used, output) {
  const child = run(process.execPath, [cli, ...prefix, "--before", before, "--after", after, "--used", used, "--out-dir", output]);
  const briefFile = path.join(output, "drift-brief.json");
  if (child.status !== 0) {
    let refusal;
    try { refusal = JSON.parse(child.stderr || child.stdout); } catch { throw new Error(`Engine failed without a JSON refusal: ${(child.stderr || child.stdout).slice(0, 1000)}`); }
    return { exit: child.status, refusal };
  }
  const brief = readJson(briefFile);
  // Tie classification to the actual input documents and the supported schema
  // path. The engine is never fed a webhook example instead of these schemas.
  assert.equal(brief.kind, "json-schema");
  assert.equal(brief.exampleMode, false);
  for (const [key, file] of Object.entries({ before, after, used })) {
    assert.equal(brief.inputs[key], `sha256:${hashFile(file)}`, `engine ${key} input digest`);
  }
  return { exit: child.status, kind: brief.kind, inputs: brief.inputs, status: brief.status, impact: brief.impact, termsVersion: brief.termsVersion };
}

try {
  const options = parseOptions(process.argv.slice(2), ["archive", "out-dir", "mode", "candidate-repo", "candidate-head", "release-tests"]);
  const mode = options.mode || "gate";
  assert(["gate", "audit"].includes(mode), "--mode must be gate or audit");
  assert(!options["candidate-repo"] || options["candidate-head"], "--candidate-repo requires --candidate-head");
  if (options["candidate-head"]) assert.match(options["candidate-head"], /^[a-f0-9]{40}$/, "candidate must be an exact commit SHA");
  assert(!options["release-tests"] || options["release-tests"] === "run", "--release-tests must be run");
  const outputRoot = options["out-dir"] ? path.resolve(options["out-dir"]) : fs.mkdtempSync(path.join(os.tmpdir(), "cw10-report-"));
  if (fs.existsSync(outputRoot)) assert.equal(fs.readdirSync(outputRoot).length, 0, "output directory must be empty");
  else fs.mkdirSync(outputRoot, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cw10-owned-"));
  try {
    const oracle = evaluateWitnesses();
    const release = await acquireRelease(path.join(scratch, "release"), options.archive || process.env.USEFUL_JOBS_ARCHIVE);
    const before = path.join(pairRoot, "before/schema.json"), after = path.join(pairRoot, "after/schema.json");
    const used = path.join(root, "fixtures/used.json");
    const rootUsed = path.join(scratch, "root-used.json"); writeJson(rootUsed, { pointers: [""] });
    const projection = path.join(outputRoot, "regression"); writeRegression(projection);
    const projectionBefore = path.join(projection, "before.json"), projectionAfter = path.join(projection, "after.json"), projectionUsed = path.join(projection, "used.json");
    function exercise(cli, prefix, label) {
      return {
        keywordPointers: engineRun(cli, prefix, before, after, used, path.join(outputRoot, `${label}-keywords`)),
        rawRoot: engineRun(cli, prefix, before, after, rootUsed, path.join(outputRoot, `${label}-root`)),
        rootProjection: engineRun(cli, prefix, projectionBefore, projectionAfter, projectionUsed, path.join(outputRoot, `${label}-projection`)),
        projectionKeywordPointers: engineRun(cli, prefix, projectionBefore, projectionAfter, path.join(root, "fixtures/regression/keyword-used.json"), path.join(outputRoot, `${label}-projection-keywords`)),
      };
    }
    const released = exercise(path.join(release.root, "bin/useful-jobs.mjs"), ["run", "json-schema-webhook-drift"], "released");
    assert.equal(released.keywordPointers.exit, 0);
    assert.equal(released.keywordPointers.status, "informational");
    assert.equal(released.keywordPointers.impact.breaking.length, 0);
    assert.equal(released.keywordPointers.impact.unknown.length, 0);
    assert.equal(released.keywordPointers.impact.unchangedCount, 2);
    assert.equal(released.rawRoot.exit, 2);
    assert.equal(released.rawRoot.refusal.code, "remote-ref-refused");
    assert.equal(released.rootProjection.exit, 0);
    assert.equal(released.rootProjection.impact.breaking.length, 1);
    assert.equal(released.projectionKeywordPointers.impact.unchangedCount, 2);
    let candidate = null;
    if (options["candidate-head"]) {
      const exported = exportCandidate(path.resolve(options["candidate-repo"] || path.join(root, "../../..")), options["candidate-head"], path.join(scratch, "candidate"));
      candidate = { head: exported.head, tree: exported.tree, execution: "immutable git archive in consumer-owned temporary directory", ...exercise(path.join(exported.root, "bin/webhook-drift.mjs"), [], "candidate") };
    }
    let releaseTests = null;
    if (options["release-tests"]) {
      const files = fs.readdirSync(path.join(release.root, "test")).filter((name) => name.endsWith(".test.mjs")).sort().map((name) => path.join("test", name));
      const preload = path.join(root, "ci/owned-port.cjs");
      const suite = run(process.execPath, ["--require", preload, "--test", "--test-concurrency=1", ...files], {
        cwd: release.root, timeout: 180_000,
      });
      fs.writeFileSync(path.join(outputRoot, "released-tests.tap"), suite.stdout + suite.stderr);
      requireSuccess(suite, "unchanged released archive suite");
      assert(suite.stdout.includes("# CW10 archive listener: 127.0.0.1:55547"), "owned test port was used");
      const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, "m").exec(suite.stdout)?.[1]);
      releaseTests = { tests: count("tests"), pass: count("pass"), fail: count("fail"), skipped: count("skipped"), workers: 1, heapMB: 768, tarOptions: "--no-same-owner", port: 55547, sourceModified: false };
      assert.deepEqual([releaseTests.tests, releaseTests.pass, releaseTests.fail, releaseTests.skipped], [15, 15, 0, 0]);
    }
    const candidateSilent = candidate && candidate.keywordPointers.exit === 0 && candidate.keywordPointers.impact.breaking.length === 0 && candidate.keywordPointers.impact.unknown.length === 0;
    const report = {
      schema: "cw10.real-schema-consumer.report.v2", source: manifest.source,
      release: { pin: release.pin, acquisition: release.acquisition, ...released }, candidate, ...oracle, releaseTests,
      acceptance: { auditPassed: true, compatible: false, gateExit: 1, mode,
        releaseKeywordFalseNegative: true, candidateKeywordFalseNegative: candidateSilent,
        evidenceClass: "self-authored consumer regression using official schemas and a separate Ajv implementation; not independent production use or demand" },
      decision: {
        changedRequestSemantics: "The parent schema accepts the saved membership request. The exact next revision rejects it only for missing changes and forbidden membership. Both migration operations are necessary and sufficient for this payload.",
        migration: manifest.migration,
        scope: "Backward compatibility of accepted webhook request bodies under the declared Draft7 schemas. This 2022 schema correction does not prove GitHub ever delivered the composed legacy event.",
        projection: "Derived root required/properties/additionalProperties regression relaxes all property values. Raw schema root remains unsupported because relative external resource refs are refused.",
      },
    };
    writeJson(path.join(outputRoot, "report.json"), report);
    process.stdout.write(`${JSON.stringify({ outputRoot, ...report.acceptance, releaseTests, candidateHead: candidate?.head || null }, null, 2)}\n`);
    process.exitCode = mode === "gate" ? 1 : 0;
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
} catch (error) {
  process.stderr.write(`cw10: ${error.message}\n`);
  process.exitCode = 2;
}
