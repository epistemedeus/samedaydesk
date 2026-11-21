import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bindUsefulDecision, decideOrReuse, digestPublicInput } from "../src/export.mjs";
import { DECISION_REASONS } from "../src/pins.mjs";
import { exportPortableDecision, importPortableDecision } from "../src/portable.mjs";
import { residualNeed } from "../src/residual.mjs";
import { runRecipe } from "../../recurring-job-recipes/lib/run.mjs";

// The producer digest is corruption detection. A changed stored outcome or
// evidence is not reuse. A missing legacy digest is not certified. Rewriting
// every stored field, including the digest, is outside this check.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const cli = join(root, "cli.mjs");
const recipeCli = join(repo, "tools/recurring-job-recipes/cli.mjs");
const fixtures = join(repo, "tools/recurring-job-recipes/fixtures");
const priorPath = join(fixtures, "priors/source-change.prior.json");
const capturePath = join(fixtures, "current/example-unchanged.json");
const VERSION = "samedaydesk.recurring-job-recipe-result.v1";
const CLOCK = "2026-09-09T08:00:00.000Z";
const WEEK = 168;
const TASK = "agl-h154540-source-change";
const SUBJECT = "example-domain-title";
const loadJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function manifestFor(recipeId, captureOverride = {}) {
  const prior = loadJson(priorPath);
  const capture = { ...loadJson(capturePath), ...captureOverride };
  const manifest = {
    recipeId,
    recipeVersion: VERSION,
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
  };
  if (recipeId === "source-change-alert") manifest.fields = ["title"];
  return manifest;
}

const options = {
  taskId: TASK,
  subject: SUBJECT,
  sequence: 1,
  clock: CLOCK,
  horizonHours: WEEK,
  optIn: true,
};

async function boundSource() {
  const produced = await runRecipe("source-change-alert", {
    priorPath,
    currentFixturePath: capturePath,
    fields: ["title"],
    clock: CLOCK,
    horizonHours: WEEK,
  });
  assert.equal(produced.ok, true, JSON.stringify(produced));
  const manifest = manifestFor("source-change-alert");
  const bound = bindUsefulDecision(manifest, produced, options);
  assert.equal(bound.ok, true, bound.message);
  assert.match(bound.observation.payload.decisionBinding.usefulBodyDigest, /^sha256:[a-f0-9]{64}$/);
  return { manifest, produced, observation: bound.observation };
}

function withoutDecision(verdict) {
  assert.equal(verdict.decision, undefined);
  assert.equal(verdict.producerInvoked, false);
  assert.equal(JSON.stringify(verdict).includes("sha256:tampered"), false);
}

test("a matching stored body reuses the producer outcome and does not run a producer", async () => {
  const { manifest, produced, observation } = await boundSource();
  const verdict = decideOrReuse(observation, manifest, options);
  assert.equal(verdict.ok, true, verdict.message);
  assert.equal(verdict.verdict, "reuse");
  assert.equal(verdict.producerInvoked, false);
  assert.equal(verdict.decision.useful.outcome, produced.outcome);
  assert.equal(verdict.decision.useful.evidence.contentHash, produced.evidence.contentHash);
  assert.equal(verdict.liveMetric.recomputeCostAvoidedNetOfUpkeep, "costs_unknown");
  assert.equal(verdict.publicSafeCertified, false);
});

test("a changed outcome or evidence content hash is not reuse", async () => {
  const { manifest, observation } = await boundSource();
  const outcome = structuredClone(observation);
  outcome.payload.usefulDecision.outcome = "changed";
  const outcomeVerdict = decideOrReuse(outcome, manifest, options);
  assert.equal(outcomeVerdict.verdict, "recompute");
  assert.equal(outcomeVerdict.reason, DECISION_REASONS.integrityMismatch);
  withoutDecision(outcomeVerdict);

  const evidence = structuredClone(observation);
  evidence.payload.usefulDecision.evidence.contentHash = "sha256:tampered";
  const evidenceVerdict = decideOrReuse(evidence, manifest, options);
  assert.equal(evidenceVerdict.verdict, "recompute");
  assert.equal(evidenceVerdict.reason, DECISION_REASONS.integrityMismatch);
  withoutDecision(evidenceVerdict);
});

test("a legacy row with no useful-body digest is not certified", async () => {
  const { manifest, observation } = await boundSource();
  const legacy = structuredClone(observation);
  delete legacy.payload.decisionBinding.usefulBodyDigest;
  const verdict = decideOrReuse(legacy, manifest, options);
  assert.equal(verdict.verdict, "recompute");
  assert.equal(verdict.reason, DECISION_REASONS.integrityUnknown);
  assert.equal(verdict.decision, undefined);
  assert.equal(verdict.producerInvoked, false);
  assert.equal(legacy.payload.decisionBinding.usefulBodyDigest, undefined);
});

test("input drift, staleness and an unsupported recipe stay recompute", async () => {
  const { manifest, observation } = await boundSource();
  const drifted = manifestFor("source-change-alert", { contentHash: "sha256:desk-drift-v2", title: "Example Domain Drifted" });
  const input = decideOrReuse(observation, drifted, options);
  assert.equal(input.reason, DECISION_REASONS.digestMismatch);
  assert.equal(input.decision, undefined);
  assert.equal(input.producerInvoked, false);

  const stale = decideOrReuse(observation, manifest, { ...options, clock: "2026-09-20T15:00:00.000Z" });
  assert.equal(stale.reason, DECISION_REASONS.staleClock);
  assert.equal(stale.producerInvoked, false);

  const unsupported = manifestFor("comparable-record-extraction");
  const refused = decideOrReuse(observation, unsupported, options);
  assert.equal(refused.reason, DECISION_REASONS.inputNotBeforeWork);
  assert.equal(refused.producerInvoked, false);
});

test("portable export verifies the producer digest and import refuses a resealed body that leaves it behind", async () => {
  const { manifest, observation } = await boundSource();
  const exported = exportPortableDecision(observation, manifest, { optIn: true, createdAt: CLOCK });
  assert.equal(exported.ok, true, exported.message);
  assert.equal(exported.portable.producerBodyDigest, observation.payload.decisionBinding.usefulBodyDigest);
  const hit = importPortableDecision(exported.portable, manifest, { clock: CLOCK });
  assert.equal(hit.verdict, "reuse");
  assert.equal(hit.decision.outcome, observation.payload.usefulDecision.outcome);
  assert.equal(hit.producerInvoked, false);

  const corrupt = structuredClone(observation);
  corrupt.payload.usefulDecision.outcome = "changed";
  assert.equal(exportPortableDecision(corrupt, manifest, { optIn: true, createdAt: CLOCK }).ok, false);
  const legacy = structuredClone(observation);
  delete legacy.payload.decisionBinding.usefulBodyDigest;
  assert.equal(exportPortableDecision(legacy, manifest, { optIn: true, createdAt: CLOCK }).ok, false);

  const body = structuredClone(exported.portable);
  delete body.integrity;
  body.decision.outcome = "changed";
  const resealed = {
    ...body,
    integrity: { bodyDigest: digestPublicInput(body), note: "corruption check only; not a signature" },
  };
  const refused = importPortableDecision(resealed, manifest, { clock: CLOCK });
  assert.equal(refused.verdict, "recompute");
  assert.equal(refused.reason, "integrity_mismatch");
  assert.equal(refused.decision, undefined);

  const controlled = structuredClone(body);
  controlled.producerBodyDigest = digestPublicInput(controlled.decision);
  const resigned = {
    ...controlled,
    integrity: { bodyDigest: digestPublicInput(controlled), note: "corruption check only; not a signature" },
  };
  const undetected = importPortableDecision(resigned, manifest, { clock: CLOCK });
  assert.equal(undetected.verdict, "reuse");
  assert.equal(undetected.publicSafeCertified, false);
});

test("residual does not project a corrupt body or a verification field remainder", async () => {
  const { manifest, observation } = await boundSource();
  const corrupt = structuredClone(observation);
  corrupt.payload.usefulDecision.evidence.contentHash = "sha256:tampered";
  const residual = residualNeed(corrupt, manifest, { ...options, want: ["description"] });
  assert.equal(residual.route, "recompute");
  assert.equal(residual.reason, DECISION_REASONS.integrityMismatch);
  assert.equal(residual.residual, null);
  assert.equal(residual.sent, false);
  assert.equal(residual.paidWork, false);
  assert.equal(residual.debtCreated, false);
  assert.equal(residual.producerInvoked, false);

  const produced = await runRecipe("verification-reconcile", {
    priorPath,
    candidatePath: capturePath,
    clock: CLOCK,
    horizonHours: WEEK,
  });
  assert.equal(produced.ok, true, JSON.stringify(produced));
  const verifyManifest = manifestFor("verification-reconcile");
  const verifyBound = bindUsefulDecision(verifyManifest, produced, {
    ...options,
    taskId: "agl-h154540-verify",
    subject: "example-domain-verify",
  });
  assert.equal(verifyBound.ok, true, verifyBound.message);
  const fields = residualNeed(verifyBound.observation, verifyManifest, {
    ...options,
    taskId: "agl-h154540-verify",
    subject: "example-domain-verify",
    want: ["description"],
  });
  assert.equal(fields.route, "recompute");
  assert.equal(fields.reason, "unsupported_field_remainder");
  assert.equal(fields.residual, null);
  assert.equal(fields.sent, false);
  assert.equal(fields.paidWork, false);
});

test("CLI refuses a mutated useful body and keeps direct compare as the unchanged path", async () => {
  const { manifest, observation, produced } = await boundSource();
  const dir = mkdtempSync(join(tmpdir(), "h154540-body-"));
  const manifestPath = join(dir, "manifest.json");
  const boundPath = join(dir, "bound.json");
  writeJson(manifestPath, manifest);
  writeJson(boundPath, observation);
  const common = [
    "--input", manifestPath,
    "--decision", boundPath,
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", "2026-09-10T15:00:00.000Z",
    "--horizon", String(WEEK),
    "--opt-in",
  ];
  const started = process.hrtime.bigint();
  const hit = spawnSync(process.execPath, [cli, "decide-or-reuse", ...common], { encoding: "utf8" });
  const reuseMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(hit.status, 0, hit.stderr);
  const hitBody = JSON.parse(hit.stdout);
  assert.equal(hitBody.verdict, "reuse");
  assert.equal(hitBody.decision.useful.outcome, produced.outcome);
  assert.equal(hitBody.producerInvoked, false);

  const stored = loadJson(boundPath);
  stored.payload.usefulDecision.outcome = "changed";
  writeJson(boundPath, stored);
  const drifted = spawnSync(process.execPath, [cli, "decide-or-reuse", ...common], { encoding: "utf8" });
  assert.equal(drifted.status, 0, drifted.stderr);
  const driftedBody = JSON.parse(drifted.stdout);
  assert.equal(driftedBody.reason, DECISION_REASONS.integrityMismatch);
  assert.equal(driftedBody.decision, undefined);
  assert.equal(driftedBody.producerInvoked, false);

  const directStarted = process.hrtime.bigint();
  const direct = spawnSync(process.execPath, [
    recipeCli,
    "--recipe", "source-change-alert",
    "--prior", priorPath,
    "--current-fixture", capturePath,
    "--fields", "title",
    "--clock", CLOCK,
    "--horizon", String(WEEK),
  ], { encoding: "utf8" });
  const directMs = Number(process.hrtime.bigint() - directStarted) / 1e6;
  assert.equal(direct.status, 0, direct.stderr);
  const directBody = JSON.parse(direct.stdout);
  assert.equal(directBody.outcome, produced.outcome);
  assert.equal(directBody.payment.attempted, false);
  assert.equal(directBody.payment.replayBlocked, true);
  console.log(`MEASURE directMs=${directMs.toFixed(3)} reuseMs=${reuseMs.toFixed(3)} outcome=${directBody.outcome} costs_unknown`);
});
