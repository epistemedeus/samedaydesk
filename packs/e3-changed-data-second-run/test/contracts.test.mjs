import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { extractCommittedKit } from "../src/kit.mjs";
import { PAIR_FILES } from "../src/paths.mjs";
import { runChangedDataPair } from "../src/run.mjs";
import { parseStdout, REPO_ROOT, runCli } from "./helpers.mjs";

const JOB1 = PAIR_FILES.ownerQaVsIndependent.replace(
  "pairs/owner-qa-vs-independent.json",
  "owner-qa/run-1/job.json",
);
const JOB2 = PAIR_FILES.ownerQaVsIndependent.replace(
  "pairs/owner-qa-vs-independent.json",
  "independent/run-2/job.json",
);

function writePair(body) {
  const dir = mkdtempSync(join(tmpdir(), "e3-contract-"));
  const pairPath = join(dir, "pair.json");
  writeFileSync(pairPath, `${JSON.stringify(body, null, 2)}\n`);
  return pairPath;
}

function mixedPair(overrides = {}) {
  return {
    schema: "samedaydesk.e3-changed-data-second-run.v1",
    jobId: "page-change-offline-job",
    demandClass: "none",
    runs: [
      {
        id: "run-1",
        evidenceClass: "owner_qa",
        callerIdentity: "pack-operator",
        jobPath: JOB1,
      },
      {
        id: "run-2",
        evidenceClass: "independent",
        callerIdentity: "declared-independent-caller",
        jobPath: JOB2,
      },
    ],
    ...overrides,
  };
}

test("run.id with .. cannot write outside --out-dir", () => {
  const parent = mkdtempSync(join(tmpdir(), "e3-escape-parent-"));
  const outDir = join(parent, "intended");
  mkdirSync(outDir);
  const pairPath = writePair(
    mixedPair({
      runs: [
        {
          id: "../escaped-run",
          evidenceClass: "owner_qa",
          callerIdentity: "pack-operator",
          jobPath: JOB1,
        },
        {
          id: "run-2",
          evidenceClass: "independent",
          callerIdentity: "declared-independent-caller",
          jobPath: JOB2,
        },
      ],
    }),
  );
  const result = runChangedDataPair({ pairPath, outDir, repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "invalid_pair");
  assert.equal(existsSync(join(parent, "escaped-run")), false);
  assert.equal(existsSync(join(parent, "escaped-run", "page-change.json")), false);
});

test("duplicate run ids are refused so outputs cannot overwrite", () => {
  const pairPath = writePair(
    mixedPair({
      runs: [
        {
          id: "same",
          evidenceClass: "owner_qa",
          callerIdentity: "pack-operator",
          jobPath: JOB1,
        },
        {
          id: "same",
          evidenceClass: "independent",
          callerIdentity: "declared-independent-caller",
          jobPath: JOB2,
        },
      ],
    }),
  );
  const result = runChangedDataPair({ pairPath, spawn: false, repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "invalid_pair");
  assert.match(result.failure.message, /duplicate run id/);
});

test("missing pair jobId is job_not_page_change", () => {
  const pair = mixedPair();
  delete pair.jobId;
  const result = runChangedDataPair({
    pairPath: writePair(pair),
    spawn: false,
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "job_not_page_change");
});

test("held job without clock is invalid_job_document", () => {
  const dir = mkdtempSync(join(tmpdir(), "e3-noclock-"));
  writeFileSync(join(dir, "before.json"), readFileSync(join(dirname(JOB1), "before.json")));
  writeFileSync(join(dir, "after.json"), readFileSync(join(dirname(JOB1), "after.json")));
  writeFileSync(
    join(dir, "job.json"),
    `${JSON.stringify({
      id: "no-clock",
      title: "missing clock",
      fields: ["title"],
      before: "./before.json",
      after: "./after.json",
    })}\n`,
  );
  const pairPath = writePair(
    mixedPair({
      runs: [
        {
          id: "run-1",
          evidenceClass: "owner_qa",
          callerIdentity: "pack-operator",
          jobPath: join(dir, "job.json"),
        },
        {
          id: "run-2",
          evidenceClass: "independent",
          callerIdentity: "declared-independent-caller",
          jobPath: JOB2,
        },
      ],
    }),
  );
  const result = runChangedDataPair({ pairPath, spawn: false, repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "invalid_job_document");
  assert.match(result.failure.message, /clock/i);
});

test("jobPath URL is refused", () => {
  const pairPath = writePair(
    mixedPair({
      runs: [
        {
          id: "run-1",
          evidenceClass: "owner_qa",
          callerIdentity: "pack-operator",
          jobPath: JOB1,
        },
        {
          id: "run-2",
          evidenceClass: "independent",
          callerIdentity: "declared-independent-caller",
          jobPath: "https://example.test/e3/job.json",
        },
      ],
    }),
  );
  const result = runChangedDataPair({ pairPath, spawn: false, repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "invalid_pair");
  assert.match(result.failure.message, /not a URL/);
});

test("non-JSON jobPath does not leak file bytes in the failure", () => {
  const pairPath = writePair(
    mixedPair({
      runs: [
        {
          id: "run-1",
          evidenceClass: "owner_qa",
          callerIdentity: "pack-operator",
          jobPath: JOB1,
        },
        {
          id: "run-2",
          evidenceClass: "independent",
          callerIdentity: "declared-independent-caller",
          jobPath: "/etc/passwd",
        },
      ],
    }),
  );
  const result = runChangedDataPair({ pairPath, spawn: false, repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "invalid_job_document");
  const blob = JSON.stringify(result);
  assert.doesNotMatch(blob, /root:x:0:0/);
  assert.doesNotMatch(blob, /Unexpected token/);
});

test("CLI --pair --compact is usage, not a pair path", () => {
  const proc = runCli(["--pair", "--compact"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.ok, false);
  assert.equal(json.failure.class, "usage");
  assert.doesNotMatch(String(proc.stdout), /--compact"/);
});

test("CLI --out-dir --owner-qa is usage and does not spawn", () => {
  const proc = runCli(["--out-dir", "--owner-qa", "--compact"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.ok, false);
  assert.equal(json.failure.class, "usage");
  assert.equal(existsSync(join(REPO_ROOT, "--owner-qa")), false);
});

test("stale extract lock is stolen instead of blocking the kit", () => {
  const dest = mkdtempSync(join(tmpdir(), "e3-kit-stale-"));
  const first = extractCommittedKit(REPO_ROOT, { dest });
  assert.equal(first.ok, true, JSON.stringify(first.failure || first));
  unlinkSync(join(dest, ".ready"));
  const lockPath = join(dest, ".extracting");
  mkdirSync(lockPath, { recursive: true });
  const old = new Date(Date.now() - 120_000);
  utimesSync(lockPath, old, old);
  const again = extractCommittedKit(REPO_ROOT, { dest });
  assert.equal(again.ok, true, JSON.stringify(again.failure || again));
  assert.equal(existsSync(again.cli), true);
});
