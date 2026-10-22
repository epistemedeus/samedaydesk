import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyPair } from "../src/classify.mjs";
import { loadPairDocument, resolvePairRuns } from "../src/pair.mjs";
import { PAIR_FILES } from "../src/paths.mjs";
import { runChangedDataPair } from "../src/run.mjs";
import { REPO_ROOT } from "./helpers.mjs";

test("owner QA vs independent stay distinct and are not repeat demand", () => {
  const loaded = loadPairDocument(PAIR_FILES.ownerQaVsIndependent);
  const resolved = resolvePairRuns(loaded);
  const classified = classifyPair(resolved);
  assert.equal(classified.ok, true, JSON.stringify(classified));
  assert.equal(classified.labels.run1, "owner_qa");
  assert.equal(classified.labels.run2, "independent");
  assert.equal(classified.labels.distinct, true);
  assert.equal(classified.labels.collapsed, false);
  assert.equal(classified.repeatDemand, false);
  assert.equal(classified.organicDemand, false);
  assert.equal(resolved.runs[0].callerIdentity, "pack-operator");
  assert.equal(resolved.runs[1].callerIdentity, "declared-independent-caller");
});

test("spawned mixed pair preserves labels on the real artifact", () => {
  const outDir = mkdtempSync(join(tmpdir(), "e3-labels-"));
  const result = runChangedDataPair({
    pairPath: PAIR_FILES.ownerQaVsIndependent,
    outDir,
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, true, JSON.stringify(result.failure || result, null, 2));
  assert.equal(result.labels.run1, "owner_qa");
  assert.equal(result.labels.run2, "independent");
  assert.equal(result.runs[0].evidenceClass, "owner_qa");
  assert.equal(result.runs[1].evidenceClass, "independent");
  assert.equal(result.repeatDemand, false);
  assert.notEqual(result.labels.run1, result.labels.run2);
});

test("owner identity labelled independent is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "e3-mislabel-"));
  const pairPath = join(dir, "pair.json");
  writeFileSync(
    pairPath,
    `${JSON.stringify(
      {
        schema: "samedaydesk.e3-changed-data-second-run.v1",
        jobId: "page-change-offline-job",
        demandClass: "none",
        runs: [
          {
            id: "run-1",
            evidenceClass: "owner_qa",
            callerIdentity: "pack-operator",
            jobPath: PAIR_FILES.ownerQaVsIndependent.replace(
              "pairs/owner-qa-vs-independent.json",
              "owner-qa/run-1/job.json",
            ),
          },
          {
            id: "run-2",
            evidenceClass: "independent",
            callerIdentity: "pack-operator",
            jobPath: PAIR_FILES.ownerQaVsIndependent.replace(
              "pairs/owner-qa-vs-independent.json",
              "independent/run-2/job.json",
            ),
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const result = runChangedDataPair({ pairPath, spawn: false, repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "owner_identity_labelled_independent");
});
