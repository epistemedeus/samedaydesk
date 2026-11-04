import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { decideOrReuse, previewReuse } from "../src/export.mjs";
import { n45RecordToObservation } from "../src/map.mjs";
import { DECISION_REASONS } from "../src/pins.mjs";
import { runSourceChangeAlert } from "../../recurring-job-recipes/recipes/source-change-alert.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const cli = join(root, "cli.mjs");
const recipeCli = join(repo, "tools/recurring-job-recipes/cli.mjs");
const fixtures = join(repo, "tools/recurring-job-recipes/fixtures");
const priorPath = join(fixtures, "priors/source-change.prior.json");
const capturePath = join(fixtures, "current/example-unchanged.json");

const RECIPE_ID = "source-change-alert";
const RECIPE_VERSION = "samedaydesk.recurring-job-recipe-result.v1";
const CLOCK = "2026-09-09T08:00:00.000Z";
const WEEK = 168;
const TASK = "source-change-example";
const SUBJECT = "source-change-example-decision";

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

function digestPublicInput(value) {
  const canonical = JSON.stringify(sortKeys(value));
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function manifestFrom(prior, capture, fields = ["title"], extra = {}) {
  return {
    recipeId: RECIPE_ID,
    recipeVersion: RECIPE_VERSION,
    fields,
    prior: {
      sha256: prior.sha256,
      sequence: prior.sequence,
      createdAt: prior.createdAt,
      payload: {
        url: prior.payload.url,
        status: prior.payload.status,
        title: prior.payload.title,
        fields: prior.payload.fields,
        contentHash: prior.payload.contentHash,
      },
    },
    capture: {
      url: capture.url,
      status: capture.status,
      title: capture.title,
      fields: capture.fields,
      contentHash: capture.contentHash,
    },
    ...extra,
  };
}

function options(extra = {}) {
  return {
    taskId: TASK,
    subject: SUBJECT,
    sequence: 1,
    clock: CLOCK,
    horizonHours: WEEK,
    optIn: true,
    ...extra,
  };
}

function usefulFrom(produced) {
  return {
    recipeId: produced.recipeId,
    recipeVersion: produced.schema,
    outcome: produced.outcome,
    recovery: {
      action: produced.recovery.action,
      operatorNext: produced.recovery.operatorNext,
    },
    evidence: {
      kind: produced.evidence.kind,
      contentHash: produced.evidence.contentHash,
      changed: produced.evidence.changed,
      unchanged: produced.evidence.unchanged,
    },
  };
}

function boundObservation(manifest, produced, extra = {}) {
  const digest = digestPublicInput(manifest);
  const useful = usefulFrom(produced);
  const observation = n45RecordToObservation({
    class: "observation",
    subject: extra.subject || SUBJECT,
    note: `${RECIPE_ID} ${useful.outcome}; recovery ${useful.recovery.action}`,
    data: {
      url: manifest.capture.url,
      contentHash: digest,
      reuseProvenance: {
        originalEvidenceUrlAvailable: true,
        sourceRole: "original_evidence_url",
      },
      decisionBinding: {
        kind: "before_work_public_input",
        recipeId: manifest.recipeId,
        recipeVersion: manifest.recipeVersion,
        inputDigest: digest,
      },
      usefulDecision: useful,
    },
  }, {
    projectId: extra.taskId || TASK,
    sequence: extra.sequence || 1,
    recordedAt: extra.clock || CLOCK,
  });
  return { observation, digest, useful };
}

test("countercase: before-work inputs return the saved useful decision without the producer result", async () => {
  const prior = loadJson(priorPath);
  const capture = loadJson(capturePath);
  const manifest = manifestFrom(prior, capture);
  const produced = await runSourceChangeAlert({
    priorPath,
    currentFixturePath: capturePath,
    fields: ["title"],
    clock: CLOCK,
    horizonHours: WEEK,
  });
  assert.equal(produced.outcome, "unchanged");
  assert.equal(produced.recovery.action, "keep_prior");
  const { observation, digest } = boundObservation(manifest, produced);
  const lib = await import("../src/export.mjs");
  if (typeof lib.digestPublicInput === "function") {
    assert.equal(lib.digestPublicInput(manifest), digest);
  }
  const verdict = decideOrReuse(observation, manifest, options());
  assert.equal(verdict.ok, true, verdict.message);
  assert.equal(verdict.verdict, "reuse");
  assert.equal(verdict.inputDigest, digest);
  assert.notEqual(verdict.inputDigest, produced.evidence.contentHash);
  assert.equal(verdict.decision.useful.outcome, produced.outcome);
  assert.equal(verdict.decision.useful.recovery.action, "keep_prior");
  assert.equal(verdict.decision.statement, observation.statement);
  assert.equal(verdict.decision.provenance.inputDigest, digest);
  assert.equal(verdict.decision.provenance.recipeId, RECIPE_ID);
  assert.equal(JSON.stringify(verdict).includes(priorPath), false);
});

test("an exported result observation is legacy input and is not upgraded", () => {
  const finished = loadJson(join(root, "fixtures/n45-page-change-result.json"));
  const preview = previewReuse(finished, {
    taskId: "n45-example-com",
    subject: "n45-example-com-result",
    sequence: 1,
    clock: CLOCK,
  });
  assert.equal(preview.ok, true, preview.message);
  const prior = loadJson(priorPath);
  const capture = loadJson(capturePath);
  const manifest = manifestFrom(prior, capture);
  const verdict = decideOrReuse(preview.observation, manifest, options({
    taskId: "n45-example-com",
    subject: "n45-example-com-result",
  }));
  assert.equal(verdict.ok, true, verdict.message);
  assert.equal(verdict.verdict, "recompute");
  assert.equal(verdict.reason, DECISION_REASONS.unboundLegacy);
  assert.equal(verdict.decision, undefined);
  assert.equal(JSON.stringify(verdict).includes("Example Domain"), false);
});

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: repo });
}

function runRecipeCli(args) {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [recipeCli, ...args], { encoding: "utf8", cwd: repo });
  const elapsedNs = Number(process.hrtime.bigint() - started);
  return { ...result, elapsedNs };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("CLI journey: one producer run, then a hit with the producer absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "source-gate-hit-"));
  const counter = join(dir, "producer-calls.txt");
  writeFileSync(counter, "");
  const stub = join(dir, "producer-stub.mjs");
  writeFileSync(stub, `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(counter)}, "x");
throw new Error("producer must not run");
`);
  const probed = spawnSync(process.execPath, [stub], { encoding: "utf8" });
  assert.notEqual(probed.status, 0);
  assert.match(probed.stderr, /producer must not run/);
  assert.equal(readFileSync(counter, "utf8"), "x");
  writeFileSync(counter, "");

  const producedRun = runRecipeCli([
    "--recipe", RECIPE_ID,
    "--prior", priorPath,
    "--current-fixture", capturePath,
    "--fields", "title",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
  ]);
  assert.equal(producedRun.status, 0, producedRun.stderr);
  const produced = JSON.parse(producedRun.stdout);
  assert.equal(produced.outcome, "unchanged");
  const producedPath = join(dir, "produced.json");
  writeJson(producedPath, produced);

  const manifest = manifestFrom(loadJson(priorPath), loadJson(capturePath));
  const manifestPath = join(dir, "manifest.json");
  writeJson(manifestPath, manifest);
  const boundPath = join(dir, "bound.json");
  const bind = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--produced", producedPath,
    "--out", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
    "--producer", stub,
  ]);
  assert.equal(bind.status, 0, bind.stderr);
  assert.equal(readFileSync(counter, "utf8"), "");
  const boundBody = JSON.parse(bind.stdout);
  assert.equal(boundBody.action, "bound");
  assert.equal(boundBody.decision.useful.outcome, "unchanged");
  const stored = readFileSync(boundPath, "utf8");
  assert.equal(stored.includes(priorPath), false);
  assert.equal(stored.includes("producer must not run"), false);

  const hit = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
    "--producer", stub,
  ]);
  assert.equal(hit.status, 0, hit.stderr);
  assert.equal(readFileSync(counter, "utf8"), "", "producer stub was invoked on the hit");
  assert.equal(hit.stderr.includes("producer must not run"), false);
  const hitBody = JSON.parse(hit.stdout);
  assert.equal(hitBody.verdict, "reuse");
  assert.equal(hitBody.decision.useful.outcome, "unchanged");
  assert.equal(hitBody.decision.useful.recovery.action, "keep_prior");
  assert.equal(hitBody.decision.statement.includes("unchanged"), true);
  assert.equal(hitBody.producerInvoked, false);
  assert.equal(typeof hitBody.mechanics.inputCaptureNs, "number");
  assert.ok(hitBody.mechanics.inputCaptureNs >= 0);
  assert.ok(hitBody.mechanics.inputCaptureBytes > 0);
  assert.equal(hitBody.liveMetric.recomputeCostAvoidedNetOfUpkeep, "costs_unknown");
  console.log(`MEASURE hit inputCaptureNs=${hitBody.mechanics.inputCaptureNs} inputCaptureBytes=${hitBody.mechanics.inputCaptureBytes} producerRunNs=${producedRun.elapsedNs} producerCalls=${readFileSync(counter, "utf8").length}`);

  const changedCapture = loadJson(capturePath);
  changedCapture.title = "Example Domain Drifted";
  changedCapture.fields = { title: "Example Domain Drifted" };
  changedCapture.contentHash = "sha256:desk-drift-v2";
  const changedManifest = manifestFrom(loadJson(priorPath), changedCapture);
  const changedPath = join(dir, "changed-manifest.json");
  writeJson(changedPath, changedManifest);
  const missed = runCli([
    "decide-or-reuse",
    "--input", changedPath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
    "--producer", stub,
  ]);
  assert.equal(missed.status, 0, missed.stderr);
  assert.equal(readFileSync(counter, "utf8"), "");
  const missedBody = JSON.parse(missed.stdout);
  assert.equal(missedBody.verdict, "recompute");
  assert.equal(missedBody.reason, DECISION_REASONS.digestMismatch);
  assert.equal(missedBody.decision, undefined);
  assert.equal(JSON.stringify(missedBody).includes("keep_prior"), false);
  assert.equal(JSON.stringify(missedBody).includes("Example Domain Drifted"), false);

  const recipeManifest = manifestFrom(loadJson(priorPath), loadJson(capturePath), ["title"], {
    recipeVersion: "samedaydesk.recurring-job-recipe-result.v2",
  });
  const recipePath = join(dir, "recipe-manifest.json");
  writeJson(recipePath, recipeManifest);
  const recipe = runCli([
    "decide-or-reuse",
    "--input", recipePath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(recipe.status, 0, recipe.stderr);
  assert.equal(JSON.parse(recipe.stdout).reason, DECISION_REASONS.recipeChanged);

  const revision = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "2",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(revision.status, 0, revision.stderr);
  assert.equal(JSON.parse(revision.stdout).reason, DECISION_REASONS.revisionChanged);

  const stale = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", "2026-09-16T08:00:01.000Z",
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(stale.status, 0, stale.stderr);
  const staleBody = JSON.parse(stale.stdout);
  assert.equal(staleBody.reason, DECISION_REASONS.staleClock);
  assert.equal(staleBody.decision, undefined);

  const onWindow = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", "2026-09-16T08:00:00.000Z",
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(onWindow.status, 0, onWindow.stderr);
  assert.equal(JSON.parse(onWindow.stdout).verdict, "reuse");

  const withdrawn = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--withdraw-opt-in",
  ]);
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  assert.equal(JSON.parse(withdrawn.stdout).reason, DECISION_REASONS.optInWithdrawn);

  const storedObservation = JSON.parse(readFileSync(boundPath, "utf8"));
  delete storedObservation.payload.usefulDecision;
  const invalidPath = join(dir, "invalid.json");
  writeJson(invalidPath, storedObservation);
  const invalid = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", invalidPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(invalid.status, 0, invalid.stderr);
  const invalidBody = JSON.parse(invalid.stdout);
  assert.equal(invalidBody.verdict, "recompute");
  assert.equal(invalidBody.reason, DECISION_REASONS.invalidSavedState);
  assert.equal(invalidBody.decision, undefined);

  const planted = "desk-token-not-for-storage";
  const privateManifest = manifestFrom(loadJson(priorPath), loadJson(capturePath));
  privateManifest.capture.token = planted;
  const privatePath = join(dir, "private-manifest.json");
  writeJson(privatePath, privateManifest);
  const rejected = runCli([
    "decide-or-reuse",
    "--input", privatePath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
    "--producer", stub,
  ]);
  assert.equal(rejected.status, 1, rejected.stdout);
  assert.equal(readFileSync(counter, "utf8"), "");
  const rejectedText = `${rejected.stdout}\n${rejected.stderr}`;
  assert.equal(rejectedText.includes(planted), false);
  assert.equal(JSON.parse(rejected.stderr).reason, DECISION_REASONS.privateField);
  assert.equal(readFileSync(boundPath, "utf8").includes(planted), false);
});

test("CLI recovery: a changed public capture is produced once and then reused", () => {
  const dir = mkdtempSync(join(tmpdir(), "source-gate-recovery-"));
  const prior = loadJson(priorPath);
  const capture = loadJson(capturePath);
  capture.title = "Example Domain Drifted";
  capture.fields = { title: "Example Domain Drifted" };
  capture.contentHash = "sha256:desk-drift-v2";
  const captureFile = join(dir, "capture.json");
  writeJson(captureFile, capture);
  const producedRun = runRecipeCli([
    "--recipe", RECIPE_ID,
    "--prior", priorPath,
    "--current-fixture", captureFile,
    "--fields", "title",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
  ]);
  assert.equal(producedRun.status, 0, producedRun.stderr);
  const produced = JSON.parse(producedRun.stdout);
  assert.equal(produced.outcome, "changed");
  assert.equal(produced.recovery.action, "review_and_sequence");
  const manifest = manifestFrom(prior, capture);
  const manifestPath = join(dir, "manifest.json");
  const producedPath = join(dir, "produced.json");
  const boundPath = join(dir, "bound.json");
  writeJson(manifestPath, manifest);
  writeJson(producedPath, produced);
  const bind = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--produced", producedPath,
    "--out", boundPath,
    "--task-id", "source-change-drift",
    "--subject", "source-change-drift-decision",
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(bind.status, 0, bind.stderr);
  const hit = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", "source-change-drift",
    "--subject", "source-change-drift-decision",
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(hit.status, 0, hit.stderr);
  const hitBody = JSON.parse(hit.stdout);
  assert.equal(hitBody.verdict, "reuse");
  assert.equal(hitBody.decision.useful.outcome, "changed");
  assert.equal(hitBody.decision.useful.recovery.action, "review_and_sequence");
  assert.match(hitBody.decision.useful.recovery.operatorNext, /Review the evidence/);
  assert.equal(hitBody.decision.useful.evidence.changed[0].field, "title");
  assert.equal(hitBody.decision.useful.evidence.changed[0].after, "Example Domain Drifted");
});

test("independent CLI consumer on a new public capture", () => {
  const dir = mkdtempSync(join(tmpdir(), "source-gate-independent-"));
  const counter = join(dir, "calls.txt");
  writeFileSync(counter, "");
  const stub = join(dir, "absent-producer.mjs");
  writeFileSync(stub, `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(counter)}, "called");
throw new Error("independent producer must stay absent");
`);
  const prior = {
    schema: "samedaydesk.recurring-job-prior.v1",
    recipeId: RECIPE_ID,
    createdAt: "2026-11-03T12:00:00.000Z",
    sequence: 4,
    immutable: true,
    sha256: "sha256:north-dock-prior",
    payload: {
      url: "https://example.com/north-dock",
      status: 200,
      title: "North dock hours",
      fields: { title: "North dock hours" },
      contentHash: "sha256:north-dock-v1",
    },
    payment: { attempted: false },
  };
  const capture = {
    url: "https://example.com/north-dock",
    status: 200,
    title: "North dock hours",
    fields: { title: "North dock hours" },
    contentHash: "sha256:north-dock-v1",
  };
  const priorFile = join(dir, "prior.json");
  const captureFile = join(dir, "capture.json");
  writeJson(priorFile, prior);
  writeJson(captureFile, capture);
  const producedRun = runRecipeCli([
    "--recipe", RECIPE_ID,
    "--prior", priorFile,
    "--current-fixture", captureFile,
    "--fields", "title",
    "--clock", "2026-11-04T15:00:00.000Z",
    "--horizon", String(WEEK),
  ]);
  assert.equal(producedRun.status, 0, producedRun.stderr);
  const produced = JSON.parse(producedRun.stdout);
  assert.equal(produced.outcome, "unchanged");
  const manifest = manifestFrom(prior, capture);
  const manifestPath = join(dir, "manifest.json");
  const producedPath = join(dir, "produced.json");
  const boundPath = join(dir, "bound.json");
  writeJson(manifestPath, manifest);
  writeJson(producedPath, produced);
  const task = "north-dock-hours";
  const subject = "north-dock-hours-decision";
  const clock = "2026-11-04T15:00:00.000Z";
  const bind = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--produced", producedPath,
    "--out", boundPath,
    "--task-id", task,
    "--subject", subject,
    "--sequence", "4",
    "--clock", clock,
    "--horizon", String(WEEK),
    "--opt-in",
  ]);
  assert.equal(bind.status, 0, bind.stderr);
  const beforeCalls = readFileSync(counter, "utf8");
  const hit = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", task,
    "--subject", subject,
    "--sequence", "4",
    "--clock", clock,
    "--horizon", String(WEEK),
    "--opt-in",
    "--producer", stub,
  ]);
  assert.equal(hit.status, 0, hit.stderr);
  assert.equal(readFileSync(counter, "utf8"), beforeCalls);
  assert.equal(statSync(stub).isFile(), true);
  const hitBody = JSON.parse(hit.stdout);
  assert.equal(hitBody.verdict, "reuse");
  assert.equal(hitBody.decision.useful.outcome, "unchanged");
  assert.equal(hitBody.decision.useful.evidence.unchanged[0].value, "North dock hours");
  assert.equal(hitBody.revision, "rev_4");
  capture.title = "North dock closed";
  capture.fields = { title: "North dock closed" };
  capture.contentHash = "sha256:north-dock-v2";
  const closed = manifestFrom(prior, capture);
  const closedPath = join(dir, "closed.json");
  writeJson(closedPath, closed);
  const again = runCli([
    "decide-or-reuse",
    "--input", closedPath,
    "--decision", boundPath,
    "--task-id", task,
    "--subject", subject,
    "--sequence", "4",
    "--clock", clock,
    "--horizon", String(WEEK),
    "--opt-in",
    "--producer", stub,
  ]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(counter, "utf8"), beforeCalls);
  const againBody = JSON.parse(again.stdout);
  assert.equal(againBody.verdict, "recompute");
  assert.equal(againBody.reason, DECISION_REASONS.digestMismatch);
  assert.equal(againBody.decision, undefined);
  assert.equal(JSON.stringify(againBody).includes("North dock"), false);
});
