import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ARCHIVE_SHA256,
  DOCUMENTED_EXTRACT_DIR,
  KIT_ENTRY,
  WORKING_EXTRACT_DIR,
} from "./constants.mjs";
import { evidenceDigest } from "./evidence-export.mjs";
import {
  ARMS,
  agreedDocument,
  reportFailures,
  runJourney,
  sha256File,
  stableSha,
} from "./evaluate.mjs";
import { defaultSubjectArchive } from "./paths.mjs";
import { containsPrivate } from "./privacy.mjs";

function sameList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index]);
}

function refuse(message) {
  return { ok: false, message };
}

export function reviewSuppliedEvidence(evidenceExport, submission, repoRoot) {
  if (!evidenceExport || evidenceExport.role !== "supplied_contributor_measurement") {
    return refuse("evidence export is not a supplied contributor measurement");
  }
  if (evidenceExport.authoritative !== false || evidenceExport.signatureIsWorkProof !== false || evidenceExport.rawFixtureIncluded !== false || evidenceExport.rawSecretsIncluded !== false) {
    return refuse("a claimed measurement or a signature is not proof of useful work");
  }
  if (evidenceExport.reuseGain !== null || evidenceExport.releaseAcceptance !== false || evidenceExport.directBaseline?.reuseGain !== null) {
    return refuse("the supplied measurement claims a reuse saving or a release");
  }
  if (containsPrivate(evidenceExport)) return refuse("evidence export contains private input");
  let suppliedSha;
  try {
    suppliedSha = evidenceDigest(evidenceExport);
  } catch {
    return refuse("evidence export is not a bounded canonical packet");
  }
  const outcome = submission?.outcome;
  if (evidenceExport.outcome !== outcome) return refuse("evidence outcome does not match the submission");
  const arm = outcome === "useful_positive" ? "positive" : outcome === "useful_negative" ? "negative" : null;
  if (!arm) return refuse("outcome is not a reviewable arm");
  const spec = ARMS[arm];
  const delta = evidenceExport.taskDelta;
  if (!delta || delta.taskId !== spec.taskId || delta.summaryMax !== spec.summaryMax || delta.extraCriterionId !== (spec.extra?.id ?? null)) {
    return refuse("task delta does not match the agreed arm");
  }
  if (evidenceExport.later?.taskId !== ARMS.later.taskId || evidenceExport.later?.summaryMax !== ARMS.later.summaryMax) {
    return refuse("later task pin does not match the agreed arm");
  }
  if (evidenceExport.changed?.stableSha256 !== submission.changed?.stableSha256 || evidenceExport.original?.stableSha256 !== submission.original?.stableSha256) {
    return refuse("submission digests do not match the supplied evidence export");
  }
  const subject = defaultSubjectArchive(repoRoot);
  let archiveSha;
  try {
    archiveSha = sha256File(subject);
  } catch {
    return refuse("current subject archive is not in the Root checkout");
  }
  if (archiveSha !== ARCHIVE_SHA256 || evidenceExport.archiveSha256 !== ARCHIVE_SHA256) {
    return refuse("subject pin does not match the current checkout");
  }
  const root = mkdtempSync(join(tmpdir(), "crt-review-"));
  try {
    const unpacked = spawnSync("tar", ["-xzf", subject, "-C", root], { encoding: "utf8" });
    if (unpacked.status !== 0) return refuse("pinned subject did not extract");
    const documented = join(root, DOCUMENTED_EXTRACT_DIR);
    const kitRoot = join(root, WORKING_EXTRACT_DIR);
    const entry = join(kitRoot, KIT_ENTRY);
    if (!existsSync(entry) || existsSync(documented) || evidenceExport.documentedPathExists !== false) {
      return refuse("documented extract root does not match the subject");
    }
    if (evidenceExport.workingExtractDirectory !== WORKING_EXTRACT_DIR || evidenceExport.entry !== KIT_ENTRY) {
      return refuse("subject entry does not match the pinned root");
    }
    const originalPath = join(kitRoot, "fixtures/journey-input.json");
    const base = JSON.parse(readFileSync(originalPath, "utf8"));
    const originalHash = sha256File(originalPath);
    if (originalHash !== evidenceExport.original?.inputSha256 || evidenceExport.original?.taskId !== base.requirements?.taskId) {
      return refuse("original input digest does not match the pinned subject");
    }
    const changedPath = join(root, "changed.json");
    const laterPath = join(root, "later.json");
    writeFileSync(changedPath, JSON.stringify(agreedDocument(base, arm)));
    writeFileSync(laterPath, JSON.stringify(agreedDocument(base, "later")));
    const changedHash = sha256File(changedPath);
    const laterHash = sha256File(laterPath);
    if (changedHash !== evidenceExport.changed?.inputSha256) return refuse("changed input digest does not match the agreed task");
    if (laterHash !== evidenceExport.later?.inputSha256) return refuse("later input digest does not match the agreed task");
    if (laterHash === originalHash) return refuse("later input did not change");
    let originalRun;
    let laterRun;
    let changedRun;
    let baselineRun;
    try {
      originalRun = runJourney(entry, originalPath, join(root, "original.out.json"));
      laterRun = runJourney(entry, laterPath, join(root, "later.out.json"));
      changedRun = runJourney(entry, changedPath, join(root, "changed.out.json"));
      baselineRun = runJourney(entry, changedPath, join(root, "changed.baseline.json"));
    } catch {
      return refuse("independent execution failed");
    }
    if (sha256File(subject) !== archiveSha) return refuse("frozen subject bytes were rewritten");
    const originalStable = stableSha(originalRun.report);
    const laterStable = stableSha(laterRun.report);
    const changedStable = stableSha(changedRun.report);
    const baselineStable = stableSha(baselineRun.report);
    const changedFailures = reportFailures(changedRun.report);
    if (baselineStable !== changedStable || baselineRun.exitCode !== changedRun.exitCode) {
      return refuse("equally equipped direct run diverged");
    }
    if (originalStable !== evidenceExport.original.stableSha256 || originalRun.report.status !== evidenceExport.original.status || originalRun.exitCode !== evidenceExport.original.exitCode) {
      return refuse("supplied original measurement does not match independent execution");
    }
    if (laterStable !== evidenceExport.later.stableSha256 || laterRun.report.status !== evidenceExport.later.status) {
      return refuse("supplied later measurement does not match independent execution");
    }
    if (changedStable !== evidenceExport.changed.stableSha256 || changedRun.report.status !== evidenceExport.changed.status || !sameList(changedFailures, evidenceExport.changed.failures)) {
      return refuse("supplied changed measurement does not match independent execution");
    }
    if (evidenceExport.directBaseline?.stableSha256 !== changedStable || evidenceExport.directBaseline?.equallyEquipped !== true) {
      return refuse("direct baseline does not match independent execution");
    }
    if (originalRun.report.status !== "utility_ok_not_release" || originalRun.report.readyForRelease !== false || originalRun.report.accepted !== false) {
      return refuse("original run is not utility_ok_not_release");
    }
    if (laterRun.report.status !== "utility_ok_not_release" || laterRun.report.readyForRelease !== false || laterRun.report.accepted !== false) {
      return refuse("later run is not utility_ok_not_release");
    }
    if (outcome === "useful_negative") {
      if (changedRun.report.status !== "integrated_partial" || !changedFailures.includes("not_string:title") || changedRun.report.accepted !== false || changedRun.report.readyForRelease !== false) {
        return refuse("independent run is not the agreed useful negative");
      }
    } else if (changedRun.report.status !== "utility_ok_not_release" || changedRun.report.readyForRelease !== false || changedRun.report.accepted !== false) {
      return refuse("independent positive run is not utility_ok_not_release");
    }
    return {
      ok: true,
      rootReview: {
        executedBy: "root",
        independent: true,
        suppliedEvidenceSha256: suppliedSha,
        acceptedClaimedMeasurementAsProof: false,
        signatureAcceptedAsWorkProof: false,
        archiveSha256: archiveSha,
        subjectPin: "current_checkout",
        original: { status: originalRun.report.status, stableSha256: originalStable, exitCode: originalRun.exitCode, inputSha256: originalHash },
        later: { status: laterRun.report.status, stableSha256: laterStable, exitCode: laterRun.exitCode, inputSha256: laterHash, taskId: ARMS.later.taskId },
        changed: { status: changedRun.report.status, stableSha256: changedStable, exitCode: changedRun.exitCode, inputSha256: changedHash, failures: changedFailures },
        directBaselineMatches: true,
        reuseGain: null,
        releaseAcceptance: false,
        matchesSupplied: true,
      },
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
