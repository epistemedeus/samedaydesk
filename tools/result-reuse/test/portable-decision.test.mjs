import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bindUsefulDecision, decideOrReuse, digestPublicInput } from "../src/export.mjs";
import {
  PORTABLE_REASONS,
  exportPortableDecision,
  importPortableDecision,
  retirePortableDecision,
} from "../src/portable.mjs";
import { runRecipe } from "../../recurring-job-recipes/lib/run.mjs";

// N6-R06: a portable decision is keyed by recipe, capture digest, prior digest
// and field list. A distinct consumer reuses it only on an exact match.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const fixtures = join(repo, "tools/recurring-job-recipes/fixtures");
const priorPath = join(fixtures, "priors/source-change.prior.json");
const capturePath = join(fixtures, "current/example-unchanged.json");
const VERSION = "samedaydesk.recurring-job-recipe-result.v1";
const CLOCK = "2026-09-09T08:00:00.000Z";
const loadJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function manifestFor(recipeId, captureOverride = {}, priorOverride = {}) {
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
      ...priorOverride,
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

async function boundFor(recipeId) {
  const input = recipeId === "source-change-alert"
    ? { priorPath, currentFixturePath: capturePath, fields: ["title"], clock: CLOCK, horizonHours: 168 }
    : { priorPath, candidatePath: capturePath, clock: CLOCK, horizonHours: 168 };
  const produced = await runRecipe(recipeId, input);
  assert.equal(produced.ok, true, JSON.stringify(produced.evidence));
  const manifest = manifestFor(recipeId);
  const bound = bindUsefulDecision(manifest, produced, {
    taskId: "producer-task", subject: "producer-subject", sequence: 1, clock: CLOCK, optIn: true,
  });
  assert.equal(bound.ok, true, bound.message);
  return { manifest, observation: bound.observation, produced };
}

async function portableFor(recipeId, extra = {}) {
  const { manifest, observation } = await boundFor(recipeId);
  const exported = exportPortableDecision(observation, manifest, { optIn: true, createdAt: CLOCK, ...extra });
  assert.equal(exported.ok, true, exported.message);
  return { manifest, observation, portable: exported.portable };
}

test("export carries public identity, CC0 rights and no task, subject or local path", async () => {
  const { portable } = await portableFor("verification-reconcile");
  const text = JSON.stringify(portable);
  assert.equal(portable.rights.license, "CC0-1.0");
  assert.equal(portable.lifecycle.state, "active");
  assert.equal(portable.createdAt, CLOCK);
  for (const banned of ["producer-task", "producer-subject", "\"taskId\":", "\"subject\":", "observationId", fixtures, "candidatePath"]) {
    assert.equal(text.includes(banned), false, banned);
  }
  assert.equal(portable.key.captureDigest, digestPublicInput(manifestFor("verification-reconcile").capture));
});

test("export refuses without opt-in, without createdAt, or for a different manifest", async () => {
  const { manifest, observation } = await boundFor("verification-reconcile");
  assert.equal(exportPortableDecision(observation, manifest, { createdAt: CLOCK }).ok, false);
  assert.equal(exportPortableDecision(observation, manifest, { optIn: true }).ok, false);
  const other = manifestFor("verification-reconcile", { contentHash: "sha256:other" });
  const refused = exportPortableDecision(observation, other, { optIn: true, createdAt: CLOCK });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /not bound to this before-work manifest/);
});

test("a distinct consumer hits with the producer absent from its tree", async () => {
  const { portable } = await portableFor("verification-reconcile");
  // Build a tree that has the result-reuse tool and the two pure helper libs it
  // imports, but no recipes and no recipe CLI. A hit here cannot run a producer.
  const tree = mkdtempSync(join(tmpdir(), "portable-no-producer-"));
  cpSync(root, join(tree, "tools/result-reuse"), { recursive: true });
  mkdirSync(join(tree, "tools/recurring-job-recipes/lib"), { recursive: true });
  for (const lib of ["cost.mjs", "recovery.mjs"]) {
    cpSync(join(repo, "tools/recurring-job-recipes/lib", lib), join(tree, "tools/recurring-job-recipes/lib", lib));
  }
  const consumer = mkdtempSync(join(tmpdir(), "portable-consumer-b-"));
  const portablePath = join(consumer, "portable.json");
  const manifestPath = join(consumer, "manifest.json");
  writeJson(portablePath, portable);
  writeJson(manifestPath, manifestFor("verification-reconcile"));
  const run = spawnSync(process.execPath, [join(tree, "tools/result-reuse/cli.mjs"), "import-decision",
    "--input", manifestPath, "--portable", portablePath], {
    encoding: "utf8", cwd: consumer, env: { PATH: process.env.PATH, HOME: consumer },
  });
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.verdict, "reuse");
  assert.equal(body.producerInvoked, false);
  assert.equal(body.decision.outcome, "unchanged");
  assert.deepEqual(body.decision, portable.decision);

  const withProducer = spawnSync(process.execPath, [join(tree, "tools/result-reuse/cli.mjs"), "import-decision",
    "--input", manifestPath, "--portable", portablePath, "--producer", "anything"], { encoding: "utf8", cwd: consumer });
  assert.equal(withProducer.status, 1);
  assert.match(withProducer.stderr, /never run a producer/);
});

test("each mismatch refuses with recompute and returns no decision", async () => {
  const { portable } = await portableFor("verification-reconcile");
  const cases = {
    [PORTABLE_REASONS.recipeChanged]: { ...manifestFor("verification-reconcile"), recipeVersion: "samedaydesk.recurring-job-recipe-result.v2" },
    [PORTABLE_REASONS.captureDigestMismatch]: manifestFor("verification-reconcile", { contentHash: "sha256:later-bytes" }),
    [PORTABLE_REASONS.priorDigestMismatch]: manifestFor("verification-reconcile", {}, { sequence: 2 }),
    [PORTABLE_REASONS.fieldsMismatch]: { ...manifestFor("verification-reconcile"), fields: ["title"] },
  };
  for (const [reason, manifest] of Object.entries(cases)) {
    const out = importPortableDecision(portable, manifest);
    assert.equal(out.ok, true, reason);
    assert.equal(out.verdict, "recompute", reason);
    assert.equal(out.reason, reason);
    assert.equal(out.decision, undefined, reason);
    assert.equal(out.producerInvoked, false, reason);
  }
  const crossRecipe = importPortableDecision(portable, manifestFor("source-change-alert"));
  assert.equal(crossRecipe.reason, PORTABLE_REASONS.recipeChanged);
  const notBeforeWork = importPortableDecision(portable, { recipeId: "issue-evidence" });
  assert.equal(notBeforeWork.reason, PORTABLE_REASONS.inputNotBeforeWork);
});

test("source-change-alert keys on the field list too", async () => {
  const { portable, manifest } = await portableFor("source-change-alert");
  assert.equal(importPortableDecision(portable, manifest).verdict, "reuse");
  const out = importPortableDecision(portable, { ...manifest, fields: ["title", "status"] });
  assert.equal(out.reason, PORTABLE_REASONS.fieldsMismatch);
});

test("retired and stale manifests recompute", async () => {
  const { portable, manifest } = await portableFor("verification-reconcile");
  const retired = retirePortableDecision(portable, { retiredAt: CLOCK, reason: "publisher withdrew it" });
  assert.equal(retired.ok, true, retired.message);
  assert.equal(retired.portable.lifecycle.state, "retired");
  assert.equal(importPortableDecision(retired.portable, manifest).reason, PORTABLE_REASONS.retired);
  const stale = retirePortableDecision(portable, { retiredAt: CLOCK, reason: "source moved", state: "stale" });
  assert.equal(importPortableDecision(stale.portable, manifest).reason, PORTABLE_REASONS.stale);
  assert.equal(retirePortableDecision(portable, { retiredAt: CLOCK, reason: "/home/someone/notes" }).ok, false);

  const dated = (await portableFor("verification-reconcile", { staleAfter: "2026-09-10T00:00:00.000Z" })).portable;
  assert.equal(importPortableDecision(dated, manifest, { clock: "2026-09-09T12:00:00.000Z" }).verdict, "reuse");
  assert.equal(importPortableDecision(dated, manifest, { clock: "2026-09-10T00:00:00.000Z" }).reason, PORTABLE_REASONS.stale);
  assert.equal(importPortableDecision(dated, manifest).reason, PORTABLE_REASONS.staleUnverifiable);
});

test("tampered, unlicensed or path-bearing portable files recompute", async () => {
  const { portable, manifest } = await portableFor("verification-reconcile");
  const flipped = structuredClone(portable);
  flipped.decision.outcome = "changed";
  assert.equal(importPortableDecision(flipped, manifest).reason, PORTABLE_REASONS.integrityMismatch);
  const unlicensed = structuredClone(portable);
  delete unlicensed.rights;
  assert.equal(importPortableDecision(unlicensed, manifest).reason, PORTABLE_REASONS.rightsMissing);
  const reactivated = retirePortableDecision(portable, { retiredAt: CLOCK, reason: "withdrawn" }).portable;
  reactivated.lifecycle.state = "active";
  assert.equal(importPortableDecision(reactivated, manifest).reason, PORTABLE_REASONS.integrityMismatch);
  assert.equal(importPortableDecision({ schema: "other" }, manifest).reason, PORTABLE_REASONS.invalidPortable);
});

test("existing taskId/subject decide-or-reuse callers are unchanged", async () => {
  const { manifest, observation } = await boundFor("verification-reconcile");
  const base = { sequence: 1, clock: CLOCK, horizonHours: 168, optIn: true };
  const same = decideOrReuse(observation, manifest, { ...base, taskId: "producer-task", subject: "producer-subject" });
  assert.equal(same.verdict, "reuse");
  assert.equal(same.decision.provenance.observationId, observation.observationId);
  const other = decideOrReuse(observation, manifest, { ...base, taskId: "consumer-b", subject: "producer-subject" });
  assert.equal(other.verdict, "recompute");
  assert.equal(other.reason, "subject_mismatch");
  // A portable file is not a saved observation and is not accepted by the legacy path.
  const { portable } = await portableFor("verification-reconcile");
  const legacy = decideOrReuse(portable, manifest, { ...base, taskId: "producer-task", subject: "producer-subject" });
  assert.equal(legacy.ok, false);
});

test("CLI round trip: export, retire and import", async () => {
  const { manifest, observation } = await boundFor("verification-reconcile");
  const dir = mkdtempSync(join(tmpdir(), "portable-cli-"));
  const cli = join(root, "cli.mjs");
  writeJson(join(dir, "manifest.json"), manifest);
  writeJson(join(dir, "bound.json"), observation);
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: dir });
  const noOptIn = run(["export-decision", "--input", "manifest.json", "--decision", "bound.json", "--created-at", CLOCK, "--out", "p.json"]);
  assert.equal(noOptIn.status, 1);
  const exported = run(["export-decision", "--input", "manifest.json", "--decision", "bound.json", "--created-at", CLOCK, "--opt-in", "--out", "p.json"]);
  assert.equal(exported.status, 0, exported.stderr);
  const hit = JSON.parse(run(["import-decision", "--input", "manifest.json", "--portable", "p.json"]).stdout);
  assert.equal(hit.verdict, "reuse");
  const retired = run(["retire-decision", "--input", "p.json", "--retired-at", CLOCK, "--reason", "withdrawn", "--out", "r.json"]);
  assert.equal(retired.status, 0, retired.stderr);
  const miss = JSON.parse(run(["import-decision", "--input", "manifest.json", "--portable", "r.json"]).stdout);
  assert.equal(miss.verdict, "recompute");
  assert.equal(miss.reason, "retired");
});
