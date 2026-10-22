import { existsSync, mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyPair } from "./classify.mjs";
import { fail, isFailure } from "./failures.mjs";
import { extractCommittedKit, runPageChangeJob } from "./kit.mjs";
import { loadPairDocument, resolvePairRuns } from "./pair.mjs";
import { JOB_ID, PAIR_FILES, PROMISED_OUTPUTS, findRepoRoot } from "./paths.mjs";

function promisedOutputsPresent(outDir) {
  const present = [];
  const missing = [];
  for (const name of PROMISED_OUTPUTS) {
    const path = join(outDir, name);
    if (existsSync(path) && statSync(path).isFile()) present.push(name);
    else missing.push(name);
  }
  return { present, missing };
}

function parseCliJson(proc) {
  const text = String(proc.stdout || "").trim();
  if (!text) return { ok: false, error: "empty stdout", raw: String(proc.stderr || "") };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err?.message || "stdout is not JSON", raw: text.slice(0, 500) };
  }
}

function slimCallerResult(cliJson) {
  const report = cliJson?.report && typeof cliJson.report === "object" ? cliJson.report : {};
  const claims = report.claims && typeof report.claims === "object" ? report.claims : {};
  const provenance = report.provenance && typeof report.provenance === "object" ? report.provenance : {};
  const changes = Array.isArray(report.changes) ? report.changes : [];
  return {
    ok: cliJson?.ok === true,
    verdict: report.verdict ?? null,
    complete: Object.hasOwn(claims, "complete") ? claims.complete : null,
    changePaths: changes.map((row) => row.path).filter(Boolean),
    engine: provenance.engine ?? null,
    engineVersion: provenance.engineVersion ?? null,
    engineEvidenceClass: provenance.evidenceClass ?? null,
    networkUsed: provenance.networkUsed === true,
    paymentAttempted: provenance.paymentAttempted === true,
    beforeSha256: provenance.beforeSha256 ?? null,
    afterSha256: provenance.afterSha256 ?? null,
  };
}

function successShell({ resolved, classified, kit, runs, spawned, outDir = null }) {
  return {
    ok: true,
    client: "e3-changed-data-second-run",
    jobId: JOB_ID,
    pairPath: resolved.path,
    paid: false,
    purchaseAuthority: false,
    schedulerDaemon: false,
    liveFetch: false,
    organicDemand: false,
    repeatDemand: false,
    changedInput: classified.changedInput,
    secondRun: classified.secondRun,
    labels: classified.labels,
    spawned,
    outDir,
    kit: kit
      ? {
          name: kit.meta.name,
          sha256: kit.meta.sha256,
          bytes: kit.meta.bytes,
          cli: "bin/useful-jobs.mjs",
          job: JOB_ID,
        }
      : null,
    runs,
  };
}

export function runChangedDataPair({
  pairPath,
  outDir = null,
  repoRoot = findRepoRoot(),
  spawn = true,
} = {}) {
  const loaded = loadPairDocument(pairPath);
  if (isFailure(loaded)) {
    return { ...loaded, client: "e3-changed-data-second-run" };
  }
  const resolved = resolvePairRuns(loaded);
  if (isFailure(resolved)) {
    return { ...resolved, client: "e3-changed-data-second-run" };
  }
  const classified = classifyPair(resolved);
  if (isFailure(classified)) {
    return {
      ...classified,
      client: "e3-changed-data-second-run",
      jobId: JOB_ID,
      pairPath: resolved.path,
      paid: false,
      repeatDemand: false,
    };
  }

  if (spawn === false) {
    return successShell({ resolved, classified, kit: null, runs: resolved.runs, spawned: false });
  }

  const kit = extractCommittedKit(repoRoot);
  if (isFailure(kit)) {
    return { ...kit, client: "e3-changed-data-second-run" };
  }

  const parent = outDir ? outDir : mkdtempSync(join(tmpdir(), "e3-changed-data-"));
  mkdirSync(parent, { recursive: true });

  const runRecords = [];
  for (const run of resolved.runs) {
    const runOut = join(parent, run.id);
    mkdirSync(runOut, { recursive: true });
    const { proc, argv } = runPageChangeJob({
      cli: kit.cli,
      jobPath: run.jobPath,
      outDir: runOut,
    });
    const parsed = parseCliJson(proc);
    const outputs = promisedOutputsPresent(runOut);
    if (proc.status !== 0 || parsed.ok !== true || parsed.json?.ok !== true) {
      return {
        ...fail("caller_job_failed", parsed.error || `page-change CLI status ${proc.status}`, {
          runId: run.id,
          status: proc.status,
          stderr: String(proc.stderr || "").slice(0, 1500),
          missing: outputs.missing,
          argv,
        }),
        client: "e3-changed-data-second-run",
      };
    }
    if (outputs.missing.length) {
      return {
        ...fail("missing_promised_outputs", undefined, {
          runId: run.id,
          missing: outputs.missing,
          present: outputs.present,
        }),
        client: "e3-changed-data-second-run",
      };
    }
    const slim = slimCallerResult(parsed.json);
    if (slim.networkUsed || slim.paymentAttempted) {
      return {
        ...fail("caller_job_failed", "page-change CLI attempted network or payment", {
          runId: run.id,
        }),
        client: "e3-changed-data-second-run",
      };
    }
    runRecords.push({
      id: run.id,
      evidenceClass: run.evidenceClass,
      callerIdentity: run.callerIdentity || (run.evidenceClass === "owner_qa" ? "pack-operator" : null),
      fingerprint: run.fingerprint,
      jobPath: run.jobPath,
      outDir: runOut,
      argv: ["node", "bin/useful-jobs.mjs", ...argv],
      status: proc.status,
      written: {
        jsonPath: join(runOut, "page-change.json"),
        mdPath: join(runOut, "page-change.md"),
      },
      present: outputs.present,
      caller: slim,
    });
  }

  return successShell({
    resolved,
    classified,
    kit,
    runs: runRecords,
    spawned: true,
    outDir: parent,
  });
}

export function pairPathForMode(mode, explicitPath) {
  if (mode === "seeded-fixture") return PAIR_FILES.seededSameFixtureRepeatDemand;
  if (mode === "owner-qa") return PAIR_FILES.ownerQa;
  if (mode === "owner-qa-vs-independent") return PAIR_FILES.ownerQaVsIndependent;
  if (mode === "pair") return explicitPath;
  return null;
}

export { PAIR_FILES };
