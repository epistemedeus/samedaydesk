/**
 * S180 owning acceptance suite (Node ≥22).
 * Consumer-path tests only. Repository packing lives in pack-repository.test.mjs
 * and is excluded from the portable archive.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  findAbsolutePaths,
  HEAVY_PIN,
  runCapabilityConsumerJourney,
  runColdStart,
  runLocalProbes,
  scrubPortable,
  buildNextStepManifest,
  resolvePrerequisites,
  bindEvidence,
  composePartial,
} from "../src/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, "..");
const CLI = join(KIT, "bin/capability-consumer-kit.mjs");
const FX = join(KIT, "fixtures/cold-start");
const JFX = join(KIT, "fixtures/journey");

function loadJson(root, name) {
  return JSON.parse(readFileSync(join(root, name), "utf8"));
}
function loadText(root, name) {
  return readFileSync(join(root, name), "utf8");
}

test("Node engine is 22+", () => {
  const major = Number(process.versions.node.split(".")[0]);
  assert.ok(major >= 22, `expected Node >=22, got ${process.versions.node}`);
});

test("literal import fullflow: resolve/bind/compose + Cap01", async () => {
  const { buildTaskRequirementsEnvelope } = await import("../src/index.mjs");
  const requirements = loadJson(FX, "caller-requirements.json");
  const envelope = buildTaskRequirementsEnvelope(requirements);
  assert.equal(envelope.status, "ready");

  const manifest = loadJson(FX, "caller-manifest-ready.json");
  const probe = loadJson(FX, "caller-probe-ready.json");
  const prereq = resolvePrerequisites({ manifest, probe });
  assert.equal(prereq.readiness, "ready");

  const source = loadText(FX, "caller-source.mjs");
  const tap = loadText(FX, "caller-tap-pass.txt");
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update(source).digest("hex");
  const binding = bindEvidence({
    declaration: { capabilityId: "R2-CAPABILITIES-03", revision: "t", sourceSha256: digest },
    source: { path: "s.mjs", content: source, revision: "t", sha256: digest },
    testOutput: { path: "t.tap", content: tap, exitCode: 0 },
    executionVerified: true,
  });
  assert.equal(binding.status, "content_bound");
  assert.equal(binding.executionVerified, false);

  const partial = composePartial({
    job: loadJson(FX, "caller-job.json"),
    parts: [loadJson(FX, "caller-part-a.json"), loadJson(FX, "caller-part-c.json")],
  });
  assert.equal(partial.status, "complete");
});

test("CLI status is portable JSON without absolute path leaks", () => {
  const r = spawnSync(process.execPath, [CLI, "status"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.heavyPin, HEAVY_PIN);
  assert.equal(j.readyForRelease, false);
  assert.equal(findAbsolutePaths(j).length, 0);
});

test("cold-start returns real artifact + next-run input", () => {
  mkdirSync(join(KIT, "portable-out"), { recursive: true });
  const outDir = mkdtempSync(join(KIT, "portable-out", "s180-cold-"));
  const relDir = relative(KIT, outDir);
  try {
    const r = spawnSync(
      process.execPath,
      [CLI, "cold-start", "--probe", "--out-dir", relDir],
      { encoding: "utf8", cwd: KIT },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const receipt = JSON.parse(r.stdout);
    assert.equal(receipt.firstUseStatus, "utility_ok_not_release");
    assert.equal(receipt.artifact, `${relDir}/cold-start-artifact.json`);
    assert.equal(receipt.nextRunInput, `${relDir}/next-run-input.json`);
    assert.ok(existsSync(join(outDir, "cold-start-artifact.json")));
    assert.ok(existsSync(join(outDir, "next-run-input.json")));
    assert.ok(existsSync(join(outDir, "next-step-manifest.json")));
    const artifact = JSON.parse(readFileSync(join(outDir, "cold-start-artifact.json"), "utf8"));
    assert.equal(artifact.schema, "pilot.r2.capabilities.cold_start_artifact.v1");
    assert.equal(artifact.stages.evidence.executionVerified, false);
    assert.equal(artifact.stages.evidence.status, "content_bound");
    assert.equal(findAbsolutePaths(artifact).length, 0);
    const nextIn = JSON.parse(readFileSync(join(outDir, "next-run-input.json"), "utf8"));
    assert.equal(findAbsolutePaths(nextIn).length, 0);
    const nextStep = JSON.parse(readFileSync(join(outDir, "next-step-manifest.json"), "utf8"));
    const journeyCmd = nextStep.commands.find((c) => c.id === "journey");
    assert.ok(journeyCmd.argv.includes(`${relDir}/next-run-input.json`));
    assert.equal(journeyCmd.argv.includes("fixtures/journey-input.json"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("probes stay dormant without explicit invoke", () => {
  const idle = runLocalProbes({ probe: false, manifest: { engines: { node: ">=22" } } });
  assert.equal(idle.invoked, false);
  assert.equal(idle.observations, null);
});

test("unavailable runtime/path yields unknown/missing — not invented ready", () => {
  const report = resolvePrerequisites({
    manifest: {
      name: "missing-bin-pkg",
      bin: { "no-such-cli": "./bin/does-not-exist.mjs" },
      engines: { node: ">=22" },
    },
    probe: {
      nodeVersionSatisfies: true,
      binExists: [],
    },
  });
  assert.equal(report.readiness, "not_ready");
  assert.ok(report.prerequisites.some((p) => p.id.startsWith("bin:") && p.state === "missing"));
});

test("incomplete evidence is untested_declaration / integrated_partial", async () => {
  const binding = bindEvidence({
    declaration: { capabilityId: "x", claim: "incomplete" },
  });
  assert.equal(binding.status, "untested_declaration");
  assert.equal(binding.executionVerified, false);

  const journey = await runCapabilityConsumerJourney({
    requirements: loadJson(FX, "caller-requirements.json"),
  });
  assert.equal(journey.status, "integrated_partial");
  assert.ok(journey.gaps.some((g) => g.field === "evidence.declaration" && g.reason === "missing"));
  assert.ok(journey.gaps.some((g) => g.field === "compose" && /missing/.test(g.reason)));
  assert.ok(journey.gaps.some((g) => g.field === "manifest"));
  assert.equal(journey.stages.fallback.status, "skipped_not_needed");
  assert.match(journey.stages.fallback.reason.note, /unknown, not ready\/content_bound/);
});

test("malformed units preserved as diagnostic gaps", async () => {
  const costInput = loadJson(JFX, "cost-input.json");
  costInput.quotes = [
    {
      id: "bad-unit",
      label: "Malformed unit quote",
      amountAtomic: "100",
      currency: "USDC",
      priceSource: "caller.supplied.quote",
      unit: { not: "a-string" },
    },
  ];
  const journey = await runCapabilityConsumerJourney({
    requirements: loadJson(FX, "caller-requirements.json"),
    costInput,
    prerequisites: {
      manifest: loadJson(FX, "caller-manifest-ready.json"),
      probe: loadJson(FX, "caller-probe-ready.json"),
    },
  });
  assert.ok(
    journey.gaps.some((g) => g.field.includes("unit") && /malformed/i.test(g.reason)),
    JSON.stringify(journey.gaps),
  );
});

test("fallback records missing_failed_outcome when caller omits failedOutcome", async () => {
  const journey = await runCapabilityConsumerJourney({
    requirements: loadJson(FX, "caller-requirements.json"),
    prerequisites: {
      manifest: loadJson(FX, "caller-manifest-catalog-only.json"),
      catalogListed: true,
    },
    forceFallback: true,
    costInput: loadJson(JFX, "cost-input.json"),
  });
  assert.equal(journey.stages.fallback.status, "missing_failed_outcome");
  assert.equal(journey.stages.fallback.reason.needed, true);
  assert.equal(journey.stages.fallback.reason.missing, "failedOutcome");
  assert.equal(journey.stages.fallback.synthetic, false);
  assert.ok(journey.gaps.some((g) => g.field === "failedOutcome" && g.reason === "missing_failed_outcome"));
  assert.equal(journey.status, "integrated_partial");
});

test("partial member retained as hole (not invented fill)", () => {
  const partial = composePartial({
    job: {
      schema: "demo.job.v1",
      scope: "neo",
      requiredFields: ["title", "missingField"],
    },
    parts: [
      {
        id: "only-title",
        status: "complete",
        schema: "demo.job.v1",
        scope: "neo",
        payload: { title: "T" },
      },
      {
        id: "running-part",
        status: "running",
        schema: "demo.job.v1",
        scope: "neo",
        payload: { missingField: "nope" },
      },
    ],
  });
  assert.equal(partial.status, "partial");
  assert.ok(partial.holes.includes("running-part") || partial.rejectedParts.some((r) => r.id === "running-part"));
  assert.ok(partial.gaps.some((g) => g.kind === "missing-field" && g.field === "missingField"));
});

test("blank input is blank_input with unknown gaps", async () => {
  const j = await runCapabilityConsumerJourney({});
  assert.equal(j.status, "blank_input");
  assert.equal(j.readyForRelease, false);
  assert.ok(j.nextStep);
});

test("tampered binding rejected; library bind remains authoritative", async () => {
  const source = loadText(FX, "caller-source.mjs");
  const tap = loadText(FX, "caller-tap-pass.txt");
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update(source).digest("hex");
  const journey = await runCapabilityConsumerJourney({
    requirements: loadJson(FX, "caller-requirements.json"),
    prerequisites: {
      manifest: loadJson(FX, "caller-manifest-ready.json"),
      probe: loadJson(FX, "caller-probe-ready.json"),
    },
    evidence: {
      declaration: { capabilityId: "R2-CAPABILITIES-03", revision: "t", sourceSha256: digest },
      source: { path: "s.mjs", content: source, revision: "t", sha256: digest },
      testOutput: { path: "t.tap", content: tap, exitCode: 0 },
      tamperedBinding: {
        status: "bound",
        executionVerified: true,
        note: "attacker-supplied",
      },
    },
    compose: {
      job: loadJson(FX, "caller-job.json"),
      parts: [loadJson(FX, "caller-part-a.json"), loadJson(FX, "caller-part-c.json")],
    },
    costInput: loadJson(JFX, "cost-input.json"),
  });
  assert.equal(journey.stages.evidence.status, "tampered_rejected");
  assert.ok(journey.gaps.some((g) => /tampered/i.test(g.reason)));
  assert.equal(journey.stages.fallback.status, "missing_failed_outcome");
  assert.equal(journey.stages.fallback.reason.needed, true);
});

test("scrubPortable removes machine absolute locator paths and preserves opaque notes' host-prefix redaction", () => {
  const scrubbed = scrubPortable({
    path: "/workspace/experiments/s180-capability-consumer-kit/src/index.mjs",
    note: "see /home/ubuntu/secret",
  });
  assert.equal(findAbsolutePaths(scrubbed).length, 0);
  assert.match(scrubbed.path, /^experiments\//);
});

test("next-step manifest is auto-runnable for objective local tasks and reads compose", () => {
  const m = buildNextStepManifest({
    schema: "x",
    stages: {
      prerequisites: { readiness: "not_ready" },
      evidence: { status: "untested_declaration" },
      compose: { status: "empty", holes: ["a"] },
    },
  }, { nextRunInputRelPath: "run-A/next-run-input.json" });
  assert.ok(m.autoRunnable.includes("inspect"));
  assert.ok(m.autoRunnable.includes("test"));
  assert.equal(m.paidCalls, false);
  assert.equal(m.liveNetwork, false);
  const journeyCmd = m.commands.find((c) => c.id === "journey");
  assert.ok(journeyCmd.argv.includes("run-A/next-run-input.json"));
  assert.equal(journeyCmd.argv.includes("fixtures/journey-input.json"), false);
  assert.ok(m.gaps.some((g) => g.field === "compose.status" && g.value === "empty"));
});

test("full journey demo CLI produces utility_ok_not_release with exact provenance", async () => {
  const out = join(tmpdir(), `s180-journey-${Date.now()}.json`);
  const r = spawnSync(process.execPath, [CLI, "journey", "--out", out], {
    encoding: "utf8",
    cwd: KIT,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const report = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(report.heavyPin, HEAVY_PIN);
  assert.equal(report.readyForRelease, false);
  assert.equal(report.status, "utility_ok_not_release");
  assert.equal(report.stages.envelope.status, "ready");
  assert.equal(report.stages.prerequisites.readiness, "ready");
  assert.equal(report.stages.evidence.status, "content_bound");
  assert.equal(report.stages.evidence.executionVerified, false);
  assert.equal(report.stages.cost.status, "ready");
  assert.equal(report.stages.fallback.status, "skipped_not_needed");
  assert.equal(report.stages.compose.status, "complete");
  assert.equal(report.stages.contextPack.status, "ready");
  assert.equal(report.stages.walkthrough.status, "ready");
  assert.equal(report.assessments.composedJob.status, "complete");
  assert.equal(report.assessments.suppliedArtifact.status, "ready");
  assert.equal(findAbsolutePaths(report).length, 0);
  assert.equal(
    report.stages.contextPack.report.endpointScope.path,
    "/api/v1/observe",
  );
});
