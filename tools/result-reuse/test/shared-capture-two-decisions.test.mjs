import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DECISION_REASONS } from "../src/pins.mjs";

// One saved public capture and one prior serve two different decisions.
// D1 asks whether a watched field changed (source-change-alert).
// D2 asks whether the later observation is still the delivered content
// (verification-reconcile). Each is produced once, bound once and then reused
// with the producer absent. A changed capture recomputes. Other recipes refuse.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const cli = join(root, "cli.mjs");
const recipeCli = join(repo, "tools/recurring-job-recipes/cli.mjs");
const fixtures = join(repo, "tools/recurring-job-recipes/fixtures");
const priorPath = join(fixtures, "priors/source-change.prior.json");
const capturePath = join(fixtures, "current/example-unchanged.json");
const changedCapturePath = join(fixtures, "current/example-changed.json");

const VERSION = "samedaydesk.recurring-job-recipe-result.v1";
const CLOCK = "2026-09-09T08:00:00.000Z";
const WEEK = "168";
const TASK = "shared-capture-example";
const D1 = { recipeId: "source-change-alert", subject: "shared-capture-field-alert" };
const D2 = { recipeId: "verification-reconcile", subject: "shared-capture-delivery-check" };

const loadJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function sharedCapture(capture) {
  return {
    url: capture.url,
    status: capture.status,
    title: capture.title,
    fields: capture.fields,
    contentHash: capture.contentHash,
  };
}

function sharedPrior(prior) {
  return {
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
  };
}

function manifestFor(recipeId, capture, extra = {}) {
  const manifest = {
    recipeId,
    recipeVersion: VERSION,
    prior: sharedPrior(loadJson(priorPath)),
    capture: sharedCapture(capture),
    ...extra,
  };
  if (recipeId === "source-change-alert" && !manifest.fields) manifest.fields = ["title"];
  return manifest;
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: repo });
}

function runRecipe(args) {
  return spawnSync(process.execPath, [recipeCli, ...args], { encoding: "utf8", cwd: repo });
}

function common(subject, extra = []) {
  return [
    "--task-id", TASK,
    "--subject", subject,
    "--sequence", "1",
    "--clock", CLOCK,
    "--horizon", WEEK,
    ...extra,
  ];
}

function producerStub(dir) {
  const counter = join(dir, "producer-calls.txt");
  writeFileSync(counter, "");
  const stub = join(dir, "producer-stub.mjs");
  writeFileSync(stub, `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(counter)}, "x");
throw new Error("producer must not run");
`);
  return { counter, stub };
}

function produceAndBind(dir, decision, manifest, producedArgs) {
  const produced = runRecipe(producedArgs);
  assert.equal(produced.status, 0, produced.stderr);
  const producedPath = join(dir, `${decision.subject}-produced.json`);
  writeFileSync(producedPath, produced.stdout);
  const manifestPath = join(dir, `${decision.subject}-manifest.json`);
  writeJson(manifestPath, manifest);
  const boundPath = join(dir, `${decision.subject}-bound.json`);
  const bind = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--produced", producedPath,
    "--out", boundPath,
    ...common(decision.subject, ["--opt-in"]),
  ]);
  assert.equal(bind.status, 0, bind.stderr);
  return { manifestPath, boundPath, bind: JSON.parse(bind.stdout), produced: JSON.parse(produced.stdout) };
}

function d1Args(candidate = capturePath) {
  return ["--recipe", D1.recipeId, "--prior", priorPath, "--current-fixture", candidate,
    "--fields", "title", "--clock", CLOCK, "--horizon", WEEK];
}

function d2Args(candidate = capturePath) {
  return ["--recipe", D2.recipeId, "--prior", priorPath, "--candidate", candidate,
    "--clock", CLOCK, "--horizon", WEEK];
}

test("one shared capture serves D2 from the normal CLI with the producer absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "shared-capture-d2-"));
  const { counter, stub } = producerStub(dir);
  const capture = loadJson(capturePath);
  const m1 = manifestFor(D1.recipeId, capture);
  const m2 = manifestFor(D2.recipeId, capture);
  assert.deepEqual(m1.capture, m2.capture, "both decisions read the same capture bytes");
  assert.deepEqual(m1.prior, m2.prior, "both decisions read the same prior");

  const one = produceAndBind(dir, D1, m1, d1Args());
  const two = produceAndBind(dir, D2, m2, d2Args());
  assert.equal(one.bind.action, "bound");
  assert.equal(two.bind.action, "bound");
  assert.equal(two.bind.recipeId, D2.recipeId);
  assert.equal(two.bind.decision.useful.outcome, "unchanged");
  assert.equal(two.bind.decision.useful.evidence.noChangeProven, true);
  assert.equal(two.bind.decision.useful.evidence.automaticPaymentReplay, false);
  assert.deepEqual(two.bind.decision.useful.evidence.mismatchedFields, []);
  assert.notEqual(one.bind.inputDigest, two.bind.inputDigest, "each decision has its own before-work digest");
  const stored = readFileSync(two.boundPath, "utf8");
  assert.equal(stored.includes(capturePath), false, "candidate path is not stored");
  assert.equal(stored.includes(priorPath), false, "prior path is not stored");

  for (const [decision, bound] of [[D2, two], [D1, one]]) {
    const hit = runCli([
      "decide-or-reuse",
      "--input", bound.manifestPath,
      "--decision", bound.boundPath,
      ...common(decision.subject, ["--opt-in", "--producer", stub]),
    ]);
    assert.equal(hit.status, 0, hit.stderr);
    const body = JSON.parse(hit.stdout);
    assert.equal(body.verdict, "reuse");
    assert.equal(body.recipeId, decision.recipeId);
    assert.equal(body.producerInvoked, false);
    assert.equal(body.decision.useful.outcome, "unchanged");
    assert.equal(body.decision.useful.recovery.action, "keep_prior");
    assert.equal(body.liveMetric.recomputeCostAvoidedNetOfUpkeep, "costs_unknown");
  }
  assert.equal(readFileSync(counter, "utf8"), "", "producer stub was never invoked");

  // A saved D1 decision is not served as a D2 answer.
  const crossed = runCli([
    "decide-or-reuse",
    "--input", two.manifestPath,
    "--decision", one.boundPath,
    ...common(D1.subject, ["--opt-in"]),
  ]);
  assert.equal(crossed.status, 0, crossed.stderr);
  const crossedBody = JSON.parse(crossed.stdout);
  assert.equal(crossedBody.verdict, "recompute");
  assert.equal(crossedBody.reason, DECISION_REASONS.recipeChanged);
  assert.equal(crossedBody.decision, undefined);
});

test("a changed shared capture recomputes D2 and the new answer differs", () => {
  const dir = mkdtempSync(join(tmpdir(), "shared-capture-d2-changed-"));
  const { counter, stub } = producerStub(dir);
  const m2 = manifestFor(D2.recipeId, loadJson(capturePath));
  const two = produceAndBind(dir, D2, m2, d2Args());

  const hashOnly = loadJson(capturePath);
  hashOnly.contentHash = "sha256:shared-capture-hash-only-v2";
  for (const [label, capture] of [["hash-only", hashOnly], ["field-changed", loadJson(changedCapturePath)]]) {
    const changedPath = join(dir, `${label}-manifest.json`);
    writeJson(changedPath, manifestFor(D2.recipeId, capture));
    const missed = runCli([
      "decide-or-reuse",
      "--input", changedPath,
      "--decision", two.boundPath,
      ...common(D2.subject, ["--opt-in", "--producer", stub]),
    ]);
    assert.equal(missed.status, 0, missed.stderr);
    const body = JSON.parse(missed.stdout);
    assert.equal(body.verdict, "recompute", label);
    assert.equal(body.reason, DECISION_REASONS.digestMismatch, label);
    assert.equal(body.decision, undefined, label);
    assert.equal(JSON.stringify(body).includes("keep_prior"), false, label);
  }
  assert.equal(readFileSync(counter, "utf8"), "");

  // Recompute is the producer, run by the caller on the changed capture.
  const candidate = join(dir, "hash-only-capture.json");
  writeJson(candidate, hashOnly);
  const fresh = runRecipe(d2Args(candidate));
  assert.equal(fresh.status, 0, fresh.stderr);
  const freshBody = JSON.parse(fresh.stdout);
  assert.equal(freshBody.outcome, "changed");
  assert.deepEqual(freshBody.evidence.mismatches.map((row) => row.field), ["contentHash"]);
});

test("D2 bind refuses a produced result that does not match the shared capture or prior", () => {
  const dir = mkdtempSync(join(tmpdir(), "shared-capture-d2-refuse-"));
  const m2 = manifestFor(D2.recipeId, loadJson(capturePath));
  const manifestPath = join(dir, "manifest.json");
  writeJson(manifestPath, m2);
  const produced = JSON.parse(runRecipe(d2Args()).stdout);

  const cases = {
    "capture identity": (value) => { value.evidence.candidateDigest.contentHash = "sha256:other"; },
    prior: (value) => { value.prior.sequence = 2; },
    "payment replay claim": (value) => { delete value.evidence.claims.automaticPaymentReplay; },
    outcome: (value) => { value.outcome = "stale_baseline"; },
    recipe: (value) => { value.recipeId = "source-change-alert"; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const value = structuredClone(produced);
    mutate(value);
    const producedPath = join(dir, `${label.replace(/ /g, "-")}.json`);
    writeJson(producedPath, value);
    const out = join(dir, `${label.replace(/ /g, "-")}-bound.json`);
    const bind = runCli([
      "decide-or-reuse",
      "--input", manifestPath,
      "--produced", producedPath,
      "--out", out,
      ...common(D2.subject, ["--opt-in"]),
    ]);
    assert.equal(bind.status, 1, `${label}: ${bind.stdout}`);
    assert.equal(existsSync(out), false, `${label}: no observation written`);
  }
});

test("an unsupported job keeps its truthful refusal and exit codes", () => {
  const dir = mkdtempSync(join(tmpdir(), "shared-capture-unknown-"));
  const manifest = manifestFor("comparable-record-extraction", loadJson(capturePath), { fields: ["title"] });
  const manifestPath = join(dir, "manifest.json");
  writeJson(manifestPath, manifest);
  const producedPath = join(dir, "produced.json");
  writeJson(producedPath, { recipeId: "comparable-record-extraction", schema: VERSION, outcome: "unchanged" });
  const out = join(dir, "bound.json");

  const bind = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--produced", producedPath,
    "--out", out,
    ...common("unsupported-job", ["--opt-in"]),
  ]);
  assert.equal(bind.status, 1, bind.stdout);
  assert.equal(bind.stdout, "");
  const refusal = JSON.parse(bind.stderr);
  assert.equal(refusal.ok, false);
  assert.match(refusal.message, /supported recipe: source-change-alert, verification-reconcile/);
  assert.equal(existsSync(out), false);

  const dir2 = mkdtempSync(join(tmpdir(), "shared-capture-unknown-saved-"));
  const saved = produceAndBind(dir2, D2, manifestFor(D2.recipeId, loadJson(capturePath)), d2Args());
  const reuse = runCli([
    "decide-or-reuse",
    "--input", manifestPath,
    "--decision", saved.boundPath,
    ...common(D2.subject, ["--opt-in"]),
  ]);
  assert.equal(reuse.status, 0, reuse.stderr);
  const body = JSON.parse(reuse.stdout);
  assert.equal(body.verdict, "recompute");
  assert.equal(body.reason, DECISION_REASONS.inputNotBeforeWork);
  assert.equal(body.decision, undefined);

  const usage = runCli([]);
  assert.equal(usage.status, 2);
  assert.match(usage.stdout, /verification-reconcile/);
});
