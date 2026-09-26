/**
 * S191 exact regressions for S190 F1–F7 plus caller-authored job variants.
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
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  bindEvidence,
  buildProbeForResolve,
  classifyEvidenceTrust,
  runCapabilityConsumerJourney,
  runColdStart,
  runLocalProbes,
  satisfiesEnginesNode,
  scrubPortable,
  TRUST_LANE,
} from "../src/index.mjs";
import { resolveCapabilityRoots } from "../scripts/pack-portable.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, "..");
const CLI = join(KIT, "bin/capability-consumer-kit.mjs");
const JOURNEY_FX = join(KIT, "fixtures/journey-input.json");
const CALLER_FX = join(KIT, "fixtures/s191/caller-job.json");

function cloneJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

test("s191 F1 empty artifact is integrated_partial with required:capabilityId", async () => {
  const input = cloneJson(JOURNEY_FX);
  input.artifact = {};
  const report = await runCapabilityConsumerJourney(input);
  assert.equal(report.status, "integrated_partial");
  assert.equal(report.stages.walkthrough.status, "failed");
  const wtGap = report.gaps.find((g) => g.field === "walkthrough.status");
  assert.ok(wtGap, JSON.stringify(report.gaps));
  assert.ok(
    wtGap.failures.includes("required:capabilityId"),
    JSON.stringify(wtGap.failures),
  );
  assert.equal(report.stages.compose.status, "complete");
  assert.equal(report.stages.evidence.status, "content_bound");
  assert.equal(report.assessments.composedJob.status, "complete");
  assert.equal(report.assessments.suppliedArtifact.status, "failed");
  assert.deepEqual(report.assessments.composedJob.independentOf, "suppliedArtifact");
});

test("s191 F1 missing Authorization is integrated_partial with exact header gap", async () => {
  const input = cloneJson(JOURNEY_FX);
  input.artifact = { capabilityId: "example", summary: "bounded" };
  delete input.buyerContext.headerValues.Authorization;
  const report = await runCapabilityConsumerJourney(input);
  assert.equal(report.status, "integrated_partial");
  assert.equal(report.stages.contextPack.status, "partial_input");
  const packGap = report.gaps.find((g) => g.field === "contextPack.status");
  assert.ok(packGap, JSON.stringify(report.gaps));
  assert.ok(
    packGap.missingInputs.includes("Authorization"),
    JSON.stringify(packGap.missingInputs),
  );
  assert.equal(report.stages.compose.status, "complete");
  assert.equal(report.stages.evidence.status, "content_bound");
  assert.equal(
    report.stages.contextPack.report.endpointScope.path,
    "/api/v1/observe",
  );
});

test("s191 F2 scrub preserves source bytes, digest, and endpoint path", async () => {
  const sourceContent = 'export const location = "/tmp/data";\n';
  const out = runColdStart({ sourceContent });
  assert.equal(out.nextRunInput.evidence.source.content, sourceContent);
  assert.equal(
    out.nextRunInput.evidence.source.sha256,
    createHash("sha256").update(sourceContent).digest("hex"),
  );
  const reloaded = JSON.parse(JSON.stringify(out.nextRunInput));
  assert.equal(reloaded.evidence.source.content, sourceContent);
  const rebound = bindEvidence(reloaded.evidence);
  assert.equal(rebound.status, "content_bound");
  assert.equal(rebound.executionVerified, false);
  assert.equal(rebound.status, out.reports.binding.status);

  const packed = scrubPortable({
    endpointScope: { path: "/api/v1/observe", url: "https://example.com/api/v1/observe" },
    content: 'export const location = "/tmp/data";\n',
    path: "/workspace/experiments/s180-capability-consumer-kit/src/index.mjs",
  });
  assert.equal(packed.endpointScope.path, "/api/v1/observe");
  assert.equal(packed.endpointScope.url, "https://example.com/api/v1/observe");
  assert.equal(packed.content, 'export const location = "/tmp/data";\n');
  assert.match(packed.path, /^experiments\//);
});

test("s191 F3 cold-start --out-dir journey command uses caller path not fixtures", () => {
  mkdirSync(join(KIT, "portable-out"), { recursive: true });
  const outDir = mkdtempSync(join(KIT, "portable-out", "s191-runA-"));
  const relDir = relative(KIT, outDir);
  try {
    const r = spawnSync(
      process.execPath,
      [CLI, "cold-start", "--out-dir", relDir],
      { encoding: "utf8", cwd: KIT },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const receipt = JSON.parse(r.stdout);
    assert.equal(receipt.nextRunInput, `${relDir}/next-run-input.json`);
    const nextStep = JSON.parse(readFileSync(join(outDir, "next-step-manifest.json"), "utf8"));
    const journeyCmd = nextStep.commands.find((c) => c.id === "journey");
    assert.deepEqual(journeyCmd.argv, [
      "node",
      "bin/capability-consumer-kit.mjs",
      "journey",
      "--input",
      `${relDir}/next-run-input.json`,
    ]);
    assert.equal(
      nextStep.gaps.some((g) => g.field === "compose.status"),
      false,
    );
    assert.equal(nextStep.commands.some((c) => c.argv.includes("fixtures/journey-input.json")), false);

    const followed = spawnSync(
      process.execPath,
      [CLI, ...journeyCmd.argv.slice(2)],
      { encoding: "utf8", cwd: KIT },
    );
    assert.equal(followed.status, 0, followed.stderr + followed.stdout);
    const followReceipt = JSON.parse(followed.stdout);
    assert.equal(followReceipt.status, "integrated_partial");
    const followOut = followReceipt.out;
    const followPath = join(KIT, followOut);
    const followReport = JSON.parse(readFileSync(existsSync(followPath) ? followPath : join(KIT, "portable-out/last-journey.json"), "utf8"));
    assert.equal(followReport.stages.evidence.status, "content_bound");
    assert.equal(followReport.stages.compose.status, "complete");
    assert.ok(followReport.gaps.some((g) => g.field === "cost.status" || g.field === "contextPack.status"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("s191 F3 cold-start rejects unsupported --input", () => {
  const r = spawnSync(
    process.execPath,
    [CLI, "cold-start", "--input", "fixtures/s191/caller-job.json"],
    { encoding: "utf8", cwd: KIT },
  );
  assert.equal(r.status, 2);
  const err = JSON.parse(r.stderr.trim().split("\n")[0]);
  assert.equal(err.error, "unsupported_flag");
  assert.equal(err.command, "cold-start");
  assert.equal(err.flag, "--input");
});

test("s191 F3 caller journey command preserves caller task identifiers", () => {
  mkdirSync(join(KIT, "portable-out"), { recursive: true });
  const work = mkdtempSync(join(KIT, "portable-out", "s191-caller-"));
  const inputRel = relative(KIT, join(work, "caller-job.json"));
  const outRel = relative(KIT, join(work, "journey.json"));
  copyFileSync(CALLER_FX, join(work, "caller-job.json"));
  try {
    const r = spawnSync(
      process.execPath,
      [CLI, "journey", "--input", inputRel, "--out", outRel],
      { encoding: "utf8", cwd: KIT },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const report = JSON.parse(readFileSync(join(work, "journey.json"), "utf8"));
    assert.equal(report.status, "utility_ok_not_release");
    assert.equal(report.stages.envelope.taskId, "s191-caller-alpha");
    const journeyCmd = report.nextStep.commands.find((c) => c.id === "journey");
    assert.ok(journeyCmd.argv.includes(inputRel));
    assert.equal(journeyCmd.argv.includes("fixtures/journey-input.json"), false);

    const followed = spawnSync(
      process.execPath,
      [CLI, "journey", "--input", inputRel, "--out", relative(KIT, join(work, "repeat.json"))],
      { encoding: "utf8", cwd: KIT },
    );
    assert.equal(followed.status, 0, followed.stderr + followed.stdout);
    const repeat = JSON.parse(readFileSync(join(work, "repeat.json"), "utf8"));
    assert.equal(repeat.status, "utility_ok_not_release");
    assert.equal(repeat.stages.envelope.taskId, "s191-caller-alpha");
    assert.equal(repeat.stages.compose.report.payload.title, "S191 Alpha Title");
    assert.equal(repeat.stages.compose.report.payload.status, "caller-complete");
    assert.equal(repeat.stages.contextPack.report.endpointScope.path, "/api/v1/observe");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("s191 F4 contradictory range, unsupported+caller true, directory bin, real file, dormant", () => {
  assert.equal(satisfiesEnginesNode(">=0 <1", process.versions.node), null);
  assert.equal(satisfiesEnginesNode(">=22", process.versions.node), true);
  assert.equal(satisfiesEnginesNode("^22", process.versions.node), null);

  const dir = mkdtempSync(join(tmpdir(), "s191-bin-"));
  try {
    const contradictory = runLocalProbes({
      probe: true,
      manifest: { name: "probe-case", engines: { node: ">=0 <1" }, bin: "." },
      packageRoot: dir,
    });
    assert.equal(contradictory.invoked, true);
    assert.equal(contradictory.observations.nodeVersionSatisfies, null);
    assert.equal(contradictory.observations.nodeEngineRangeSupported, false);
    assert.deepEqual(contradictory.observations.binExists, []);
    assert.ok(contradictory.observations.binRejected.some((b) => b.reason === "not_regular_file"));

    const merged = buildProbeForResolve(contradictory, {
      nodeVersionSatisfies: true,
      binExists: ["probe-case"],
    });
    assert.notEqual(merged.nodeVersionSatisfies, true);
    assert.equal(merged.nodeVersionSatisfies, undefined);
    assert.equal(merged.provenance.nodeVersionSatisfies, "local_unknown");
    assert.equal(merged.provenance.callerDeclaredNodeVersionSatisfies, true);
    assert.deepEqual(merged.binExists, []);
    assert.deepEqual(merged.callerDeclared.nodeVersionSatisfies, true);

    const pkg = join(KIT, "fixtures/cold-start/pkg");
    const real = runLocalProbes({
      probe: true,
      manifest: {
        name: "s172-first-run-cli",
        bin: "./cli.js",
        engines: { node: ">=22" },
      },
      packageRoot: pkg,
    });
    assert.equal(real.observations.nodeVersionSatisfies, true);
    assert.deepEqual(real.observations.binExists, ["s172-first-run-cli"]);

    const dormant = runLocalProbes({
      probe: false,
      manifest: { engines: { node: ">=0 <1" }, bin: "." },
      packageRoot: dir,
    });
    assert.equal(dormant.invoked, false);
    assert.equal(dormant.observations, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("s191 F5 omitted/ambiguous/none mutation states stay distinguishable", async () => {
  const base = cloneJson(CALLER_FX);

  const omitted = await runCapabilityConsumerJourney({ ...base, forceFallback: true });
  assert.equal(omitted.stages.fallback.status, "missing_failed_outcome");
  assert.equal(omitted.status, "integrated_partial");
  assert.equal(omitted.stages.fallback.report, undefined);
  assert.ok(omitted.gaps.some((g) => g.reason === "missing_failed_outcome"));

  const ambiguous = await runCapabilityConsumerJourney({
    ...base,
    failedOutcome: {
      schema: "pilot.r2.capabilities.failure_outcome.v1",
      capabilityId: "s191_caller_extract",
      attemptId: "s191-attempt-ambiguous",
      failureClass: "validation",
      mutationState: "ambiguous",
      observedState: { summary: "caller left mutation ambiguous" },
    },
  });
  assert.equal(ambiguous.stages.fallback.status, "ready");
  assert.equal(ambiguous.stages.fallback.mutationPreservation.mutationState, "ambiguous");
  assert.equal(ambiguous.stages.fallback.mutationPreservation.sideEffectsClean, false);
  assert.equal(ambiguous.stages.fallback.mutationPreservation.preserveAmbiguity, true);
  assert.equal(ambiguous.stages.fallback.factualAttempt, true);

  const none = await runCapabilityConsumerJourney({
    ...base,
    failedOutcome: {
      schema: "pilot.r2.capabilities.failure_outcome.v1",
      capabilityId: "s191_caller_extract",
      attemptId: "s191-attempt-none",
      failureClass: "validation",
      mutationState: "none",
      observedState: { summary: "caller supplied none" },
    },
  });
  assert.equal(none.stages.fallback.status, "ready");
  assert.equal(none.stages.fallback.mutationPreservation.mutationState, "none");
  assert.equal(none.stages.fallback.mutationPreservation.sideEffectsClean, true);
  assert.equal(none.stages.fallback.factualAttempt, true);
});

test("s191 F6 classifyEvidenceTrust treats bare booleans as caller-declared claims", async () => {
  const direct = classifyEvidenceTrust({
    executionVerified: true,
    accepted: true,
  });
  assert.notEqual(direct.lanes.executed, TRUST_LANE.EXECUTED);
  assert.notEqual(direct.lanes.accepted, TRUST_LANE.ACCEPTED);
  assert.equal(direct.lanes.executed, "caller_declared_execution");
  assert.equal(direct.lanes.accepted, "caller_declared_accepted");
  assert.equal(direct.callerDeclared.executionVerified, true);
  assert.equal(direct.callerDeclared.accepted, true);

  const caller = cloneJson(CALLER_FX);
  const journey = await runCapabilityConsumerJourney(caller);
  assert.equal(journey.trust.lanes.executed, "not_executed_attested");
  assert.equal(journey.trust.lanes.accepted, "not_accepted");
  assert.equal(journey.stages.evidence.executionVerified, false);
});

test("s191 F7 unpacked packer resolves vendored roots", () => {
  const tmp = mkdtempSync(join(tmpdir(), "s191-f7-"));
  try {
    mkdirSync(join(tmp, "vendor/s138-capability-evidence/src"), { recursive: true });
    writeFileSync(join(tmp, "vendor/s138-capability-evidence/src/index.mjs"), "export {}\n");
    mkdirSync(join(tmp, "vendor/capabilities/01/src"), { recursive: true });
    writeFileSync(join(tmp, "vendor/capabilities/01/src/index.mjs"), "export {}\n");
    const roots = resolveCapabilityRoots(tmp);
    assert.equal(roots.layout, "vendored");
    assert.ok(roots.heavy.endsWith("vendor/s138-capability-evidence"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("s191 caller-job success / missing context / corrupt digest / contradictory engines / withheld failure", async () => {
  const successInput = cloneJson(CALLER_FX);
  const success = await runCapabilityConsumerJourney(successInput);
  assert.equal(success.status, "utility_ok_not_release");
  assert.equal(success.stages.envelope.taskId, "s191-caller-alpha");
  assert.equal(success.stages.evidence.status, "content_bound");
  assert.equal(success.stages.evidence.executionVerified, false);
  assert.equal(success.stages.compose.status, "complete");
  assert.equal(success.stages.compose.report.payload.title, "S191 Alpha Title");
  assert.equal(success.stages.contextPack.status, "ready");
  assert.equal(success.gaps.length, 0);

  const missingCtx = cloneJson(CALLER_FX);
  delete missingCtx.buyerContext.headerValues.Authorization;
  const missing = await runCapabilityConsumerJourney(missingCtx);
  assert.equal(missing.status, "integrated_partial");
  assert.equal(missing.stages.contextPack.status, "partial_input");
  assert.ok(
    missing.gaps.some(
      (g) => g.field === "contextPack.status" && g.missingInputs.includes("Authorization"),
    ),
    JSON.stringify(missing.gaps),
  );
  assert.equal(missing.stages.evidence.status, "content_bound");
  assert.equal(missing.stages.compose.status, "complete");

  const corruptInput = cloneJson(CALLER_FX);
  corruptInput.evidence.declaration.sourceSha256 =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  corruptInput.evidence.source.sha256 =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const corrupt = await runCapabilityConsumerJourney(corruptInput);
  assert.equal(corrupt.status, "integrated_partial");
  assert.equal(corrupt.stages.evidence.status, "untested_declaration");
  assert.equal(corrupt.stages.evidence.executionVerified, false);
  assert.ok(corrupt.gaps.some((g) => g.field === "evidence.status" && g.reason === "untested_declaration"));

  const enginesInput = cloneJson(CALLER_FX);
  enginesInput.probe = true;
  enginesInput.prerequisites.manifest.engines = { node: ">=0 <1" };
  enginesInput.prerequisites.manifest.bin = ".";
  enginesInput.packageRoot = KIT;
  const engines = await runCapabilityConsumerJourney(enginesInput);
  assert.equal(engines.status, "integrated_partial");
  assert.notEqual(engines.stages.prerequisites.readiness, "ready");
  assert.equal(engines.localProbe.invoked, true);
  assert.equal(engines.stages.prerequisites.probeProvenance.nodeVersionSatisfies, "local_unknown");
  assert.notEqual(engines.stages.prerequisites.report.prerequisites.find((p) => p.id === "node-engine")?.state, "satisfied");

  const withheldInput = cloneJson(CALLER_FX);
  withheldInput.forceFallback = true;
  delete withheldInput.failedOutcome;
  const withheld = await runCapabilityConsumerJourney(withheldInput);
  assert.equal(withheld.status, "integrated_partial");
  assert.equal(withheld.stages.fallback.status, "missing_failed_outcome");
  assert.equal(withheld.stages.fallback.synthetic, false);
  assert.ok(!withheld.stages.fallback.report);
});
