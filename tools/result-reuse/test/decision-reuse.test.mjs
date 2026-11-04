import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bindUsefulDecision, decideOrReuse, previewReuse } from "../src/export.mjs";
import { DECISION_REASONS, OBSERVATION_SCHEMA } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const fixtures = join(root, "fixtures");
const cli = join(root, "cli.mjs");

const CLOCK = "2026-09-09T08:00:00.000Z";
const WEEK = 168;

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function baseOptions(extra = {}) {
  return {
    taskId: "n45-example-com",
    subject: "n45-example-com-result",
    sequence: 1,
    clock: CLOCK,
    horizonHours: WEEK,
    optIn: true,
    ...extra,
  };
}

function savedFrom(input, extra = {}) {
  const preview = previewReuse(input, baseOptions(extra));
  assert.equal(preview.ok, true, preview.message);
  return preview;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

test("a preview of a finished result stays an unbound legacy observation", () => {
  const input = load("n45-page-change-result.json");
  const preview = savedFrom(input);
  assert.equal(preview.observation.source.version.startsWith("sha256:"), true);
  const verdict = decideOrReuse(preview.observation, input, baseOptions());
  const wrapped = decideOrReuse(preview, input, baseOptions());
  assert.equal(verdict.ok, true, verdict.message);
  assert.equal(verdict.verdict, "recompute");
  assert.equal(verdict.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(verdict.decision, undefined);
  assert.equal(wrapped.verdict, "recompute");
  assert.equal(wrapped.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(verdict.costBaseline.primary.kind, "costs_unknown");
  assert.equal(verdict.costBaseline.primary.asOf, "2026-09-09");
  assert.equal(verdict.liveMetric.distinctLaterAcceptedTasksTakingReuse, null);
  assert.equal(verdict.liveMetric.recomputeCostAvoidedNetOfUpkeep, "costs_unknown");
  assert.equal(verdict.liveMetric.observedAcceptedTaskLedger, false);
  assert.equal(verdict.publicSafeCertified, false);
  assert.ok(verdict.cannotEstablish.some((item) => /accepted task/.test(item)));
  assert.equal(preview.observation.schema, OBSERVATION_SCHEMA);
});

test("a changed finished result is still legacy input, not a before-work digest miss", () => {
  const input = load("n45-page-change-result.json");
  const preview = savedFrom(input);
  const changed = structuredClone(input);
  changed.contentHash = `sha256:${"ab".repeat(32)}`;
  changed.bytes = input.bytes + 1;
  const changedPreview = savedFrom(changed);
  assert.notEqual(changedPreview.observation.source.version, preview.observation.source.version);
  const verdict = decideOrReuse(preview.observation, changed, baseOptions());
  assert.equal(verdict.ok, true, verdict.message);
  assert.equal(verdict.verdict, "recompute");
  assert.equal(verdict.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(verdict.decision, undefined);
  assert.equal(verdict.liveMetric.recomputeCostAvoidedNetOfUpkeep, "costs_unknown");
});

test("a legacy result observation is not reused inside or outside the recipe window", () => {
  const input = load("n45-page-change-result.json");
  const preview = savedFrom(input);
  const onWindow = decideOrReuse(preview.observation, input, baseOptions({
    clock: "2026-09-16T08:00:00.000Z",
  }));
  assert.equal(onWindow.verdict, "recompute");
  assert.equal(onWindow.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(onWindow.decision, undefined);
  const stale = decideOrReuse(preview.observation, input, baseOptions({
    clock: "2026-09-16T08:00:01.000Z",
  }));
  assert.equal(stale.ok, true, stale.message);
  assert.equal(stale.verdict, "recompute");
  assert.equal(stale.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(stale.decision, undefined);
});

test("withdrawn opt-in recomputes instead of reusing", () => {
  const input = load("n45-page-change-result.json");
  const preview = savedFrom(input);
  const verdict = decideOrReuse(preview.observation, input, baseOptions({
    optIn: false,
    optInWithdrawn: true,
  }));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.verdict, "recompute");
  assert.equal(verdict.reason, DECISION_REASONS.optInWithdrawn);
  assert.match(verdict.message, /withdrawn/);
});

test("oversize public input keeps the existing limits and does not reuse", () => {
  const manifest = {
    recipeId: "source-change-alert",
    recipeVersion: "samedaydesk.recurring-job-recipe-result.v1",
    fields: ["title"],
    prior: {
      sha256: "sha256:prior",
      sequence: 1,
      createdAt: CLOCK,
      payload: { title: "Example Domain" },
    },
    capture: {
      url: "https://example.com/",
      contentHash: "sha256:wide",
      title: "Example Domain",
    },
  };
  const wide = {
    schema: manifest.recipeVersion,
    recipeId: manifest.recipeId,
    outcome: "unchanged",
    recovery: { action: "keep_prior", operatorNext: "Keep the prior." },
    evidence: {
      kind: "field_diff",
      contentHash: "sha256:wide",
      changed: [],
      unchanged: [{ field: "title", value: "x".repeat(40_000) }],
    },
  };
  const payload = bindUsefulDecision(manifest, wide, baseOptions());
  assert.equal(payload.ok, false);
  assert.match(payload.message, /32768/);
  assert.notEqual(payload.verdict, "reuse");
  assert.notEqual(payload.action, "bound");

  const huge = { blob: "y".repeat(1_048_577) };
  const capped = decideOrReuse({}, huge, baseOptions());
  assert.equal(capped.ok, false);
  assert.match(capped.message, /1048576/);
  assert.notEqual(capped.verdict, "reuse");
});

test("a legacy result observation is not upgraded when the subject or revision differs", () => {
  const input = load("n45-page-change-result.json");
  const preview = savedFrom(input);
  const subject = decideOrReuse(preview.observation, input, baseOptions({
    subject: "other-public-subject",
  }));
  assert.equal(subject.verdict, "recompute");
  assert.equal(subject.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(subject.decision, undefined);
  const revision = decideOrReuse(preview.observation, input, baseOptions({ sequence: 2 }));
  assert.equal(revision.verdict, "recompute");
  assert.equal(revision.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(revision.decision, undefined);
});

test("a private field is rejected and its value is not echoed", () => {
  const input = load("n45-page-change-result.json");
  const preview = savedFrom(input);
  const marked = structuredClone(input);
  const planted = "not-a-secret-decision-value";
  marked.token = planted;
  const verdict = decideOrReuse(preview.observation, marked, baseOptions());
  assert.equal(verdict.ok, false);
  assert.equal(verdict.verdict, "rejected");
  assert.equal(verdict.reason, DECISION_REASONS.privateField);
  assert.equal(JSON.stringify(verdict).includes(planted), false);
  assert.equal(verdict.inputDigest, undefined);
});

test("CLI decide-or-reuse hit and withdrawn opt-in", () => {
  const inputPath = join(fixtures, "n45-page-change-result.json");
  const preview = savedFrom(load("n45-page-change-result.json"));
  const dir = mkdtempSync(join(tmpdir(), "decide-reuse-"));
  const decision = join(dir, "observation.json");
  writeFileSync(decision, `${JSON.stringify(preview.observation, null, 2)}\n`);
  const common = [
    "--decision", decision,
    "--input", inputPath,
    "--task-id", "n45-example-com",
    "--subject", "n45-example-com-result",
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", "168",
  ];
  const hit = spawnSync(process.execPath, [cli, "decide-or-reuse", ...common, "--opt-in"], {
    encoding: "utf8",
    cwd: repo,
  });
  assert.equal(hit.status, 0, hit.stderr);
  const hitBody = JSON.parse(hit.stdout);
  assert.equal(hitBody.verdict, "recompute");
  assert.equal(hitBody.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(hitBody.decision, undefined);

  const withdrawn = spawnSync(process.execPath, [cli, "decide-or-reuse", ...common, "--withdraw-opt-in"], {
    encoding: "utf8",
    cwd: repo,
  });
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  assert.equal(JSON.parse(withdrawn.stdout).reason, DECISION_REASONS.optInWithdrawn);
});

test("existing preview and export outputs stay byte-identical", () => {
  const expected = {
    page: "8a6e1cdc6afc88e6f77e197e06b234bb180e098fd9e442988c955fb048f88c5b",
    n45: "436919a439ea9868a502017800af8b946e88a245b9501687a97b038e08819733",
    batch: "950235ea181c9eb6e10a7ad76d3f9c6e28574de6651b5e986ea9c4b08825957d",
    recordOut: "43281361f91b4fe5b7a4b7a6386b1d399d5c38026f8ed482dc51db8201b2f615",
    recordStdout: "350df9c5b6aab5bede5a42708d422c2dd1c2c641f2e64ec8e8d95c66fe7b0e3f",
  };
  const clock = "2026-09-09T10:00:00.000Z";
  const page = run([
    "preview",
    "--input", join(fixtures, "accepted-page-change.json"),
    "--task-id", "vendor-watch",
    "--subject", "vendor-page-result",
    "--sequence", "1",
    "--clock", clock,
  ]);
  assert.equal(sha256(page.stdout), expected.page);
  const n45 = run([
    "preview",
    "--input", join(fixtures, "n45-page-change-result.json"),
    "--task-id", "n45-example-com",
    "--subject", "n45-example-com-result",
    "--sequence", "1",
    "--clock", CLOCK,
  ]);
  assert.equal(sha256(n45.stdout), expected.n45);
  const batch = run([
    "preview",
    "--input", join(fixtures, "accepted-extract-batch.json"),
    "--task-id", "extract-product-jsonld",
    "--subject", "extract-product-jsonld-result",
    "--sequence", "1",
    "--clock", clock,
  ]);
  assert.equal(sha256(batch.stdout), expected.batch);
  const dir = mkdtempSync(join(tmpdir(), "reuse-bytes-"));
  const out = join(dir, "record.json");
  const record = run([
    "export",
    "--input", join(fixtures, "accepted-record-report.json"),
    "--task-id", "record-sku",
    "--subject", "record-sku-result",
    "--sequence", "1",
    "--clock", clock,
    "--opt-in",
    "--out", out,
  ]);
  assert.equal(record.status, 0, record.stderr);
  assert.equal(sha256(record.stdout), expected.recordStdout);
  assert.equal(sha256(readFileSync(out)), expected.recordOut);
});

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: repo });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
