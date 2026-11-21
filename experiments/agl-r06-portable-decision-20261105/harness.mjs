#!/usr/bin/env node
// N6-R06 portable decision experiment. Two isolated consumers (separate HOME and
// state dirs) over committed synthetic fixtures. Consumer A publishes portable
// CC0 decisions into a commons dir; consumer B tries them first against its own
// captures. Every number here is from synthetic fixtures and a single sample.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectUseful } from "../../tools/result-reuse/src/export.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const reuseCli = join(repo, "tools/result-reuse/cli.mjs");
const recipeCli = join(repo, "tools/recurring-job-recipes/cli.mjs");
const RECIPE = "verification-reconcile";
const VERSION = "samedaydesk.recurring-job-recipe-result.v1";
const CLOCK = "2026-11-05T08:00:00.000Z";
const HORIZON = "168";
const ADAPTATION_BASE = "3a4a7538";

const loadJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export function runExperiment({ workDir = mkdtempSync(join(tmpdir(), "agl-r06-")), resultPath = null } = {}) {
  const index = loadJson(join(here, "fixtures/index.json"));
  const consumers = {
    A: makeConsumer(workDir, "consumer-a"),
    B: makeConsumer(workDir, "consumer-b"),
  };
  const commons = join(workDir, "commons");
  mkdirSync(commons, { recursive: true });

  // Each consumer receives its own copies of the fixtures. Neither reads the other's state dir.
  for (const row of index.cases) {
    for (const [name, consumer] of Object.entries(consumers)) {
      const dir = join(consumer.state, row.case);
      mkdirSync(dir, { recursive: true });
      copyFileSync(join(here, "fixtures", row.case, "prior.json"), join(dir, "prior.json"));
      copyFileSync(join(here, "fixtures", row.case, `capture-${name.toLowerCase()}.json`), join(dir, "capture.json"));
    }
  }

  // Baseline: each consumer runs the recipe directly on every case.
  const baseline = {};
  for (const [name, consumer] of Object.entries(consumers)) {
    baseline[name] = index.cases.map((row) => {
      const run = produce(consumer, row.case, "producerCalls");
      return { case: row.case, outcome: run.body.outcome, ms: run.ms };
    });
  }

  // Consumer A binds each produced decision (taskId/subject required by the
  // existing bind path) and exports a portable decision into the commons.
  const published = [];
  for (const row of index.cases) {
    const dir = join(consumers.A.state, row.case);
    const produced = join(dir, "produced.json");
    writeFileSync(produced, produce(consumers.A, row.case, "publishCalls").raw);
    const manifest = join(dir, "manifest.json");
    writeJson(manifest, manifestFor(dir));
    const bound = join(dir, "bound.json");
    const bind = cli(consumers.A, reuseCli, ["decide-or-reuse", "--input", manifest, "--produced", produced, "--out", bound,
      "--task-id", "agl-r06-consumer-a", "--subject", `fixture-${row.case}`, "--sequence", "1",
      "--clock", CLOCK, "--horizon", HORIZON, "--opt-in"]);
    if (bind.status !== 0) throw new Error(`bind ${row.case}: ${bind.stderr}`);
    const portable = join(dir, "portable.json");
    const exported = cli(consumers.A, reuseCli, ["export-decision", "--input", manifest, "--decision", bound,
      "--created-at", CLOCK, "--opt-in", "--out", portable]);
    if (exported.status !== 0) throw new Error(`export ${row.case}: ${exported.stderr}`);
    let finalPortable = portable;
    if (row.retireBeforeImport) {
      finalPortable = join(dir, "portable.retired.json");
      const retired = cli(consumers.A, reuseCli, ["retire-decision", "--input", portable,
        "--retired-at", CLOCK, "--reason", "publisher withdrew this fixture decision", "--out", finalPortable]);
      if (retired.status !== 0) throw new Error(`retire ${row.case}: ${retired.stderr}`);
    }
    copyFileSync(finalPortable, join(commons, `${row.case}.portable.json`));
    published.push({ case: row.case, retired: Boolean(row.retireBeforeImport) });
  }

  // Treatment: consumer B tries the commons first, recomputes on any refusal,
  // and shadow-runs the producer on hits to check for false reuse.
  const treatment = [];
  for (const row of index.cases) {
    const dir = join(consumers.B.state, row.case);
    const manifestPath = join(dir, "manifest.json");
    const manifest = manifestFor(dir);
    writeJson(manifestPath, manifest);
    const before = consumers.B.counters.producerCalls;
    const started = process.hrtime.bigint();
    const imported = cli(consumers.B, reuseCli, ["import-decision", "--input", manifestPath,
      "--portable", join(commons, `${row.case}.portable.json`), "--clock", CLOCK]);
    const importMs = msSince(started);
    if (imported.status !== 0) throw new Error(`import ${row.case}: ${imported.stderr}`);
    const body = JSON.parse(imported.stdout);
    const entry = { case: row.case, verdict: body.verdict, reason: body.reason ?? null, importMs };
    if (body.verdict === "reuse") {
      entry.producerCallsDuringHit = consumers.B.counters.producerCalls - before;
      const shadow = produce(consumers.B, row.case, "shadowCalls");
      const direct = selectUseful(shadow.body, manifest);
      entry.shadowMs = shadow.ms;
      entry.matchesShadow = direct.ok && JSON.stringify(direct.useful) === JSON.stringify(body.decision);
      entry.outcome = body.decision.outcome;
    } else {
      const fresh = produce(consumers.B, row.case, "producerCalls");
      entry.recomputeMs = fresh.ms;
      entry.outcome = fresh.body.outcome;
    }
    treatment.push(entry);
  }

  // Control: the existing taskId/subject path, if A's bound observation were
  // handed to B. B has its own task identity, so it cannot reuse it.
  const friction = [];
  for (const row of index.cases.slice(0, 2)) {
    const legacy = cli(consumers.B, reuseCli, ["decide-or-reuse", "--input", join(consumers.B.state, row.case, "manifest.json"),
      "--decision", join(consumers.A.state, row.case, "bound.json"),
      "--task-id", "agl-r06-consumer-b", "--subject", `fixture-${row.case}`, "--sequence", "1",
      "--clock", CLOCK, "--horizon", HORIZON, "--opt-in"]);
    friction.push({ case: row.case, verdict: JSON.parse(legacy.stdout).verdict, reason: JSON.parse(legacy.stdout).reason });
  }

  const leaks = scanCommons(commons, [workDir, consumers.A.state, consumers.A.home]);
  const hits = treatment.filter((row) => row.verdict === "reuse");
  const refusals = treatment.filter((row) => row.verdict !== "reuse");
  const result = {
    experiment: "agl-r06-portable-decision-20261105",
    hypothesis: "N6-R06: a saved decision plus its public manifest is a portable CC0 artifact that a distinct consumer with no shared Pilot state can reuse, without running the producer, when the digest of its own capture matches exactly; otherwise it recomputes.",
    dataLabel: "synthetic fixtures only; not real outside data",
    recipe: RECIPE,
    recipeChoice: "verification-reconcile: runs offline on fixtures and is already a supported decide-or-reuse recipe. issue-evidence and comparable-record-extraction are not supported by the decision binding, and adding them was out of scope.",
    cases: index.cases.length,
    caseMixNote: "the hit rate reflects the designed case mix (2 changed captures, 1 retired manifest required by the brief), not any real-world reuse rate",
    hitRate: round(hits.length / index.cases.length),
    hits: hits.length,
    falseReuseCount: hits.filter((row) => row.matchesShadow !== true).length,
    recomputeCount: refusals.length,
    retirements: refusals.filter((row) => row.reason === "retired").length,
    refusalReasons: Object.fromEntries(refusals.map((row) => [row.case, row.reason])),
    producerCallsOnHits: hits.reduce((sum, row) => sum + row.producerCallsDuringHit, 0),
    counters: {
      consumerA: consumers.A.counters,
      consumerB: consumers.B.counters,
      note: "producerCalls counts baseline plus recompute runs; shadowCalls are verification-only runs on hits; publishCalls are A's runs before export",
    },
    localPathOrStateLeaksInCommons: leaks,
    adaptationLinesChanged: adaptationLines(),
    timings: {
      sample: "single-sample",
      unit: "ms wall clock per child process, includes node startup",
      baseline,
      treatment: treatment.map(({ case: id, importMs, shadowMs, recomputeMs }) => ({ case: id, importMs, shadowMs: shadowMs ?? null, recomputeMs: recomputeMs ?? null })),
    },
    treatment,
    costs: {
      producer: "costs_unknown",
      review: "costs_unknown",
      upkeep: "costs_unknown",
    },
    taskIdSubjectFriction: {
      observed: true,
      publishSide: "consumer A must still invent a taskId, subject and sequence to bind a decision before export-decision can run; the portable file drops them",
      consumeSideLegacyPath: friction,
      note: "with the existing decide-or-reuse path, a distinct consumer using its own taskId gets subject_mismatch even on identical capture bytes; the portable path avoids that by keying on recipe and digests",
    },
    isolation: {
      separateHomeDirs: true,
      separateStateDirs: true,
      sharedArtifactsOnly: "commons/*.portable.json",
      controlOnlyException: "the taskIdSubjectFriction control reads A's bound observation to show the legacy refusal; the treatment never does",
    },
    unrun: [
      "live public pages",
      "a real distinct outside consumer",
      "the VM / Postgres task-memory store",
      "multi-sample timing",
    ],
    paymentAuthority: "none",
  };
  if (resultPath) writeJson(resultPath, result);
  return result;
}

function makeConsumer(workDir, name) {
  const root = join(workDir, name);
  const home = join(root, "home");
  const state = join(root, "state");
  mkdirSync(home, { recursive: true });
  mkdirSync(state, { recursive: true });
  return { name, home, state, counters: { producerCalls: 0, shadowCalls: 0, publishCalls: 0 } };
}

function cli(consumer, script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    cwd: consumer.state,
    env: { PATH: process.env.PATH, HOME: consumer.home, XDG_STATE_HOME: consumer.state, XDG_CONFIG_HOME: join(consumer.home, ".config") },
  });
}

function produce(consumer, caseId, counter) {
  consumer.counters[counter] += 1;
  const dir = join(consumer.state, caseId);
  const started = process.hrtime.bigint();
  const run = cli(consumer, recipeCli, ["--recipe", RECIPE, "--prior", join(dir, "prior.json"),
    "--candidate", join(dir, "capture.json"), "--clock", CLOCK, "--horizon", HORIZON]);
  const ms = msSince(started);
  if (run.status !== 0) throw new Error(`producer ${caseId}: ${run.stderr}`);
  return { raw: run.stdout, body: JSON.parse(run.stdout), ms };
}

// The before-work manifest is built only from the consumer's own files.
function manifestFor(dir) {
  const prior = loadJson(join(dir, "prior.json"));
  const capture = loadJson(join(dir, "capture.json"));
  return {
    recipeId: RECIPE,
    recipeVersion: VERSION,
    prior: {
      sha256: prior.sha256,
      sequence: prior.sequence,
      createdAt: prior.createdAt,
      payload: {
        url: prior.payload.url,
        status: prior.payload.status,
        title: prior.payload.title,
        contentHash: prior.payload.contentHash,
      },
    },
    capture: {
      url: capture.url,
      status: capture.status,
      title: capture.title,
      contentHash: capture.contentHash,
    },
  };
}

function scanCommons(commons, needles) {
  const found = [];
  for (const file of readdirSync(commons)) {
    const text = readFileSync(join(commons, file), "utf8");
    for (const needle of needles) if (text.includes(needle)) found.push({ file, needle: "consumer state path" });
    for (const [label, pattern] of [
      ["taskId key", /"taskId"\s*:/],
      ["subject key", /"subject"\s*:/],
      ["observationId key", /"observationId"\s*:/],
      ["producer task name", /agl-r06-consumer-a/],
      ["candidatePath key", /"candidatePath"\s*:/],
      ["path key", /"path"\s*:/],
    ]) {
      if (pattern.test(text)) found.push({ file, needle: label });
    }
  }
  return found;
}

function adaptationLines() {
  const diff = spawnSync("git", ["diff", "--numstat", ADAPTATION_BASE, "--", "tools/result-reuse/src", "tools/result-reuse/cli.mjs"], { cwd: repo, encoding: "utf8" });
  if (diff.status !== 0) return { base: ADAPTATION_BASE, added: null, removed: null, note: "git diff unavailable" };
  let added = 0;
  let removed = 0;
  for (const line of diff.stdout.trim().split("\n").filter(Boolean)) {
    const [a, r] = line.split("\t");
    added += Number(a);
    removed += Number(r);
  }
  // New files not yet committed are invisible to git diff; count them too.
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "--", "tools/result-reuse/src", "tools/result-reuse/cli.mjs"], { cwd: repo, encoding: "utf8" });
  for (const file of (untracked.stdout || "").trim().split("\n").filter(Boolean)) {
    added += readFileSync(join(repo, file), "utf8").split("\n").length - 1;
  }
  return { base: ADAPTATION_BASE, scope: "tools/result-reuse/src and cli.mjs, excluding tests and this harness", added, removed };
}

function msSince(started) {
  return round(Number(process.hrtime.bigint() - started) / 1e6);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = runExperiment({ resultPath: join(here, "RESULT.json") });
  process.stdout.write(`${JSON.stringify({ hitRate: result.hitRate, falseReuseCount: result.falseReuseCount, recomputeCount: result.recomputeCount, retirements: result.retirements }, null, 2)}\n`);
}
