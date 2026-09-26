/**
 * S205 exact regressions for S200 residuals F1–F5 plus external caller replay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  bindEvidence,
  buildNextStepManifest,
  runCapabilityConsumerJourney,
  runColdStart,
  scrubPortable,
  verifySuppliedArtifact,
} from "../src/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, "..");
const CLI = join(KIT, "bin/capability-consumer-kit.mjs");
const CALLER_FX = join(KIT, "fixtures/s191/caller-job.json");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function cloneJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function s205CallerJob(overrides = {}) {
  const base = cloneJson(CALLER_FX);
  base.taskId = "s205-caller-external";
  base.requirements.taskId = "s205-caller-external";
  base.requirements.title = "S205 external caller replay";
  base.requirements.objectiveCriteria.push({
    id: "loc_eq",
    description: "location equals the caller path literal",
    check: { kind: "json_path_equals", path: "location", equals: "/tmp/data" },
  });
  base.artifact.capabilityId = "s191_caller_extract";
  base.artifact.summary = "S205 caller-authored observation payload";
  base.artifact.location = "/tmp/data";
  base.costInput.taskId = "s205-caller-external";
  base.buyerContext.taskId = "s205-caller-external";
  return { ...base, ...overrides };
}

test("s205 F1 json_path_equals missing/wrong/correct via verifier", () => {
  const envelope = {
    outputConstraints: {
      requiredFields: [],
      objectiveChecks: [
        {
          id: "loc_eq",
          check: { kind: "json_path_equals", path: "location", equals: "/tmp/data" },
        },
      ],
    },
  };
  const missing = verifySuppliedArtifact({}, envelope);
  assert.equal(missing.ok, false);
  assert.ok(missing.failures.includes("missing:location"), JSON.stringify(missing.failures));

  const wrong = verifySuppliedArtifact({ location: "/var/other" }, envelope);
  assert.equal(wrong.ok, false);
  assert.ok(wrong.failures.includes("equals:location"), JSON.stringify(wrong.failures));

  const correct = verifySuppliedArtifact({ location: "/tmp/data" }, envelope);
  assert.equal(correct.ok, true);
});

test("s205 F1 json_path_equals missing/wrong/correct via full journey", async () => {
  const missing = s205CallerJob();
  delete missing.artifact.location;
  const missingR = await runCapabilityConsumerJourney(missing);
  assert.equal(missingR.status, "integrated_partial");
  assert.equal(missingR.stages.walkthrough.status, "failed");
  assert.ok(
    missingR.stages.walkthrough.verifyFailures.includes("missing:location"),
    JSON.stringify(missingR.stages.walkthrough.verifyFailures),
  );

  const wrong = s205CallerJob();
  wrong.artifact.location = "/var/other";
  const wrongR = await runCapabilityConsumerJourney(wrong);
  assert.equal(wrongR.status, "integrated_partial");
  assert.ok(wrongR.stages.walkthrough.verifyFailures.includes("equals:location"));

  const correct = s205CallerJob();
  const ok = await runCapabilityConsumerJourney(correct);
  assert.equal(ok.status, "utility_ok_not_release");
  assert.equal(ok.stages.walkthrough.status, "ready");
  assert.equal(ok.stages.evidence.executionVerified, false);
  assert.equal(ok.artifact?.location ?? correct.artifact.location, "/tmp/data");
});

test("s205 F2 cold-start binds and serializes the same evidence object", () => {
  const source = 'export const s205 = "bound-bytes";\n';
  const tap = "ok 1 - s205\n# tests 1\n# pass 1\n# fail 0\n";
  const digest = sha256(source);
  const evidence = {
    declaration: {
      capabilityId: "R2-CAPABILITIES-03",
      revision: "s205-ev",
      sourceSha256: digest,
    },
    source: { path: "s205.mjs", content: source, revision: "s205-ev", sha256: digest },
    testOutput: { path: "s205.tap", content: tap, exitCode: 0 },
  };
  const out = runColdStart({ mode: "caller", evidence });
  assert.equal(out.nextRunInput.evidence.source.content, source);
  assert.equal(out.nextRunInput.evidence.source.sha256, digest);
  assert.equal(out.reports.binding.status, "content_bound");
  assert.equal(out.reports.binding.executionVerified, false);
  const reloaded = JSON.parse(JSON.stringify(out.nextRunInput.evidence));
  assert.equal(reloaded.source.content, source);
  const rebound = bindEvidence(reloaded);
  assert.equal(rebound.status, "content_bound");
  assert.equal(rebound.executionVerified, false);

  const conflict = runColdStart({
    mode: "caller",
    evidence,
    sourceContent: 'export const other = "override";\n',
  });
  assert.equal(conflict.reports.binding.status, "conflict_override");
  assert.equal(conflict.nextRunInput.evidence, undefined);
  assert.ok(conflict.nextRunInput.evidenceConflict);
  assert.notEqual(
    conflict.nextRunInput.evidenceConflict.evidenceSourceSha256,
    conflict.nextRunInput.evidenceConflict.overrideSourceSha256,
  );
});

test("s205 F3 scrub preserves equals literals and argv input paths", () => {
  const scrubbed = scrubPortable({
    check: { kind: "json_path_equals", path: "location", equals: "/tmp/data" },
    argv: ["node", "bin/capability-consumer-kit.mjs", "journey", "--input", "/tmp/ext/caller.json"],
    location: "/tmp/data",
  });
  assert.equal(scrubbed.check.equals, "/tmp/data");
  assert.equal(scrubbed.argv[4], "/tmp/ext/caller.json");
  assert.equal(scrubbed.location, "/tmp/data");
});

test("s205 F4 autoRunnable does not overwrite caller next-run-input", () => {
  mkdirSync(join(KIT, "portable-out"), { recursive: true });
  const target = join(KIT, "portable-out", "next-run-input.json");
  const marker = JSON.stringify({ s205: "caller-must-not-be-replaced", taskId: "s205-caller-external" });
  writeFileSync(target, marker);
  const before = sha256(readFileSync(target));
  try {
    const m = buildNextStepManifest(
      {
        schema: "x",
        stages: { prerequisites: { readiness: "not_ready" } },
      },
      { nextRunInputRelPath: "portable-out/next-run-input.json" },
    );
    assert.equal(m.autoRunnable.includes("cold-start"), false);
    const cold = m.commands.find((c) => c.id === "cold-start");
    assert.ok(cold.argv.includes("portable-out/demo-cold-start"));
    assert.equal(cold.auto, false);
    for (const id of m.autoRunnable) {
      if (id === "test") continue;
      const cmd = m.commands.find((c) => c.id === id);
      const r = spawnSync(process.execPath, [CLI, ...cmd.argv.slice(2)], {
        encoding: "utf8",
        cwd: KIT,
      });
      assert.equal(r.status, 0, r.stderr + r.stdout);
    }
    const after = sha256(readFileSync(target));
    assert.equal(after, before);
    assert.equal(readFileSync(target, "utf8"), marker);
  } finally {
    // leave portable-out as gitignored
  }
});

test("s205 F5 missing --input operand is rejected not demo", () => {
  const r = spawnSync(process.execPath, [CLI, "journey", "--input"], {
    encoding: "utf8",
    cwd: KIT,
  });
  assert.equal(r.status, 2);
  const err = JSON.parse(r.stderr.trim().split("\n")[0]);
  assert.equal(err.error, "missing_flag_value");
  assert.equal(err.flag, "--input");
});

test("s205 F5 null journey input is rejected before demo inspect", async () => {
  const r = await runCapabilityConsumerJourney(null);
  assert.equal(r.status, "rejected");
  assert.equal(r.error.code, "invalid_input");
});

test("s205 F5 empty declaration is contained at evidence stage", async () => {
  const r = await runCapabilityConsumerJourney({
    evidence: { declaration: {} },
  });
  assert.equal(r.status, "integrated_partial");
  assert.equal(r.stages.evidence.status, "failed");
  assert.match(String(r.stages.evidence.error), /capabilityId/);
  assert.ok(r.gaps.some((g) => g.field === "evidence"));
});

test("s205 external caller replay: evidence, equals, unavailable prereq, decoy, path criterion", async () => {
  const extDir = mkdtempSync(join(tmpdir(), "s205-ext-"));
  const extInput = join(extDir, "caller.json");
  const decoy = join(KIT, "caller.json");
  const job = s205CallerJob();
  const originalBytes = Buffer.from(`${JSON.stringify(job, null, 2)}\n`);
  writeFileSync(extInput, originalBytes);
  const decoyJob = s205CallerJob();
  decoyJob.taskId = "s205-decoy-kit-file";
  decoyJob.requirements.taskId = "s205-decoy-kit-file";
  writeFileSync(decoy, `${JSON.stringify(decoyJob, null, 2)}\n`);
  const outPath = join(extDir, "journey.json");
  try {
    const r = spawnSync(
      process.execPath,
      [CLI, "journey", "--input", extInput, "--out", outPath],
      { encoding: "utf8", cwd: KIT },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const receipt = JSON.parse(r.stdout);
    assert.equal(receipt.status, "utility_ok_not_release");
    const report = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(report.stages.envelope.taskId, "s205-caller-external");
    assert.notEqual(report.stages.envelope.taskId, "s205-decoy-kit-file");
    assert.equal(report.stages.evidence.status, "content_bound");
    assert.equal(report.stages.evidence.executionVerified, false);
    assert.equal(report.stages.walkthrough.status, "ready");
    const journeyCmd = report.nextStep.commands.find((c) => c.id === "journey");
    assert.ok(journeyCmd);
    assert.equal(journeyCmd.argv.includes("caller.json"), false);
    const replayArg = journeyCmd.argv[journeyCmd.argv.indexOf("--input") + 1];
    assert.ok(replayArg);
    const replayAbs = join(KIT, replayArg);
    assert.ok(existsSync(replayAbs), replayArg);
    assert.equal(sha256(readFileSync(replayAbs)), sha256(originalBytes));
    assert.equal(readFileSync(replayAbs).equals(originalBytes), true);

    const followed = spawnSync(process.execPath, [CLI, ...journeyCmd.argv.slice(2), "--out", join(extDir, "repeat.json")], {
      encoding: "utf8",
      cwd: KIT,
    });
    assert.equal(followed.status, 0, followed.stderr + followed.stdout);
    const repeat = JSON.parse(readFileSync(join(extDir, "repeat.json"), "utf8"));
    assert.equal(repeat.status, "utility_ok_not_release");
    assert.equal(repeat.stages.envelope.taskId, "s205-caller-external");
    assert.equal(repeat.stages.evidence.executionVerified, false);
    assert.equal(repeat.stages.compose.report.payload.title, "S191 Alpha Title");

    const unavailable = s205CallerJob();
    unavailable.prerequisites.probe = { binExists: [], nodeVersionSatisfies: true };
    writeFileSync(join(extDir, "unavail.json"), `${JSON.stringify(unavailable, null, 2)}\n`);
    const u = spawnSync(
      process.execPath,
      [CLI, "journey", "--input", join(extDir, "unavail.json"), "--out", join(extDir, "unavail-out.json")],
      { encoding: "utf8", cwd: KIT },
    );
    assert.equal(u.status, 0, u.stderr + u.stdout);
    const uReport = JSON.parse(readFileSync(join(extDir, "unavail-out.json"), "utf8"));
    assert.equal(uReport.status, "integrated_partial");
    assert.notEqual(uReport.stages.prerequisites.readiness, "ready");
    assert.ok(uReport.gaps.some((g) => g.field === "prerequisites.readiness"));
    assert.equal(uReport.stages.evidence.status, "content_bound");
    assert.equal(uReport.stages.evidence.executionVerified, false);
  } finally {
    rmSync(extDir, { recursive: true, force: true });
    if (existsSync(decoy)) rmSync(decoy);
  }
});
