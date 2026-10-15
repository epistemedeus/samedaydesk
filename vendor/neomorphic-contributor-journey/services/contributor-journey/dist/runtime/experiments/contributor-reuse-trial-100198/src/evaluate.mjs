import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize } from "../deps/canonical/canonical.mjs";
import {
  ARCHIVE_SHA256,
  COMPAT_ID,
  DOCUMENTED_EXTRACT_DIR,
  KIT_ENTRY,
  OFFER_ID,
  SCHEMA_MEASUREMENT,
  WORKING_EXTRACT_DIR,
} from "./constants.mjs";
import { redactPaths } from "./privacy.mjs";

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function stableReport(report) {
  return {
    status: report.status,
    gaps: report.gaps,
    readyForRelease: report.readyForRelease,
    accepted: report.accepted,
    paidCalls: report.paidCalls,
    demo: report.demo,
    liveNetwork: report.liveNetwork,
    dryRun: report.dryRun,
  };
}

export function stableSha(report) {
  return createHash("sha256").update(canonicalize(stableReport(report)), "utf8").digest("hex");
}

function failuresOf(report) {
  const found = [];
  for (const gap of report.gaps ?? []) {
    if (Array.isArray(gap.failures)) found.push(...gap.failures);
  }
  return found;
}

export function reportFailures(report) {
  return failuresOf(report);
}

const TITLE_CRITERION = Object.freeze({
  id: "title_len",
  description: "title bound the artifact does not have",
  check: Object.freeze({ kind: "string_max_length", path: "title", max: 80 }),
});

export const ARMS = Object.freeze({
  positive: Object.freeze({ taskId: "crt-100198-changed-summary", summaryMax: 400, extra: null }),
  later: Object.freeze({ taskId: "crt-100198-later-input", summaryMax: 200, extra: null }),
  negative: Object.freeze({ taskId: "crt-100198-negative-title", summaryMax: 400, extra: TITLE_CRITERION }),
});

export function agreedDocument(base, arm) {
  const spec = ARMS[arm];
  if (!spec) throw new Error(`unknown arm ${arm}`);
  return mutate(base, spec.taskId, spec.summaryMax, spec.extra);
}

function summarize(name, taskId, inputPath, run, effortRecord) {
  const report = run.report;
  return {
    name,
    taskId,
    exitCode: run.exitCode,
    status: report.status,
    gapCount: Array.isArray(report.gaps) ? report.gaps.length : null,
    failures: failuresOf(report),
    readyForRelease: report.readyForRelease,
    accepted: report.accepted,
    paidCalls: report.paidCalls,
    demo: report.demo,
    inputSha256: sha256File(inputPath),
    stableSha256: stableSha(report),
    releaseAcceptance: false,
    effort: effortRecord,
  };
}

function effort(commands, amendments) {
  return {
    contributorCommands: commands,
    requesterVerification: 1,
    requesterAmendments: amendments,
    unit: "commands",
    durationIsEngineeringSavings: false,
    tokenReceipts: { kind: "unknown" },
  };
}

function mutate(base, taskId, summaryMax, extra) {
  const doc = structuredClone(base);
  doc.requirements.taskId = taskId;
  doc.requirements.title = `Changed task ${taskId}`;
  doc.requirements.summary = `Changed later input ${taskId}. Same public kit. Not an endorsement.`;
  doc.costInput.taskId = taskId;
  for (const criterion of doc.requirements.objectiveCriteria) {
    if (criterion.id === "summary_len") criterion.check.max = summaryMax;
  }
  if (extra) doc.requirements.objectiveCriteria.push(extra);
  return doc;
}

export function runJourney(entry, inputPath, outPath) {
  const kitRoot = join(entry, "..", "..");
  const run = spawnSync(process.execPath, [entry, "journey", "--input", inputPath, "--out", outPath], {
    cwd: kitRoot,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error(`capability-preflight journey exited ${run.status}: ${run.stderr}`);
  }
  return { exitCode: run.status, report: JSON.parse(readFileSync(outPath, "utf8")) };
}

function runPair(entry, inputPath, receiptOut, baselineOut) {
  const receipt = runJourney(entry, inputPath, receiptOut);
  const baseline = runJourney(entry, inputPath, baselineOut);
  if (stableSha(receipt.report) !== stableSha(baseline.report) || receipt.exitCode !== baseline.exitCode) {
    throw new Error("equally equipped direct baseline diverged from the receipt run");
  }
  return receipt;
}

function directBaseline(run) {
  return {
    equallyEquipped: true,
    command: `node ${KIT_ENTRY} journey --input <input.json> --out <baseline.json>`,
    exitCode: run.exitCode,
    stableSha256: stableSha(run.report),
    status: run.report.status,
    readyForRelease: run.report.readyForRelease,
    accepted: run.report.accepted,
    reuseGain: null,
    contributorCommands: 1,
    harnessComparisonRuns: 1,
    countedAsContributorSavings: false,
    tokenReceipts: { kind: "unknown" },
  };
}

function runJson(repoRoot, args) {
  const run = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  return { exitCode: run.status ?? 1, stdout: run.stdout, stderr: run.stderr };
}

function otherPacks(repoRoot) {
  const list = runJson(repoRoot, ["experiments/discovery-receive-20260930/bin/discover-engines.mjs", "list"]);
  let listSchema = null;
  let paymentAuthority = null;
  if (list.exitCode === 0) {
    const parsed = JSON.parse(list.stdout);
    listSchema = parsed.schema;
    paymentAuthority = parsed.paymentAuthority;
  }
  const pins = runJson(repoRoot, ["experiments/bounty-economics-20260912/bin/bounty-economics.mjs", "pins"]);
  let pinsSchema = null;
  let absolutePathRedacted = false;
  if (pins.exitCode === 0) {
    const parsed = JSON.parse(pins.stdout);
    pinsSchema = parsed.schema;
    absolutePathRedacted = JSON.stringify(parsed).includes("/home/") || JSON.stringify(parsed).includes("/Users/");
  }
  const effortRun = runJson(repoRoot, [
    "experiments/effort-integration-20260922/bin/effort-workflow.mjs",
    "--input",
    "experiments/effort-integration-20260922/examples/synthetic-caller.json",
  ]);
  return {
    discoveryReceiveList: {
      exitCode: list.exitCode,
      schema: listSchema,
      paymentAuthority,
      acceptanceAuthority: false,
    },
    bountyEconomicsPins: {
      exitCode: pins.exitCode,
      schema: pinsSchema,
      absolutePathRedacted,
      amendedHere: false,
      paymentPerformed: false,
    },
    effortWorkflow: {
      available: false,
      exitCode: effortRun.exitCode,
      reason: "esbuild_missing",
      replacementProvisioned: false,
    },
  };
}

export function evaluate(options) {
  const subjectArchive = options.subjectArchive ?? (options.repoRoot ? join(options.repoRoot, "public/downloads/capability-preflight/capability-preflight.tar.gz") : null);
  if (!subjectArchive) throw new Error("subject archive is required");
  const repoRoot = options.repoRoot ?? null;
  const archiveSha256 = sha256File(subjectArchive);
  if (archiveSha256 !== ARCHIVE_SHA256) {
    throw new Error("capability-preflight archive pin mismatch");
  }
  const root = mkdtempSync(join(tmpdir(), "crt-pack-"));
  try {
    const unpacked = spawnSync("tar", ["-xzf", subjectArchive, "-C", root], { encoding: "utf8" });
    if (unpacked.status !== 0) throw new Error(unpacked.stderr);
    const documented = join(root, DOCUMENTED_EXTRACT_DIR);
    const kitRoot = join(root, WORKING_EXTRACT_DIR);
    const entry = join(kitRoot, KIT_ENTRY);
    if (!existsSync(entry)) throw new Error("working entry missing from the public archive");
    const base = JSON.parse(readFileSync(join(kitRoot, "fixtures/journey-input.json"), "utf8"));
    const artifact = JSON.parse(readFileSync(join(kitRoot, "fixtures/journey/artifact.good.json"), "utf8"));
    if (typeof artifact.summary !== "string" || typeof artifact.title === "string") {
      throw new Error("artifact field binding changed");
    }
    const originalPath = join(kitRoot, "fixtures/journey-input.json");
    const originalRun = runJourney(entry, originalPath, join(root, "original.json"));
    const positiveDoc = agreedDocument(base, "positive");
    const positivePath = join(root, "positive.json");
    writeFileSync(positivePath, JSON.stringify(positiveDoc));
    const positiveRun = runPair(entry, positivePath, join(root, "positive.out.json"), join(root, "positive.baseline.json"));
    const laterDoc = agreedDocument(base, "later");
    const laterPath = join(root, "later.json");
    writeFileSync(laterPath, JSON.stringify(laterDoc));
    const laterRun = runPair(entry, laterPath, join(root, "later.out.json"), join(root, "later.baseline.json"));
    const negativeDoc = agreedDocument(base, "negative");
    const negativePath = join(root, "negative.json");
    writeFileSync(negativePath, JSON.stringify(negativeDoc));
    const negativeRun = runPair(entry, negativePath, join(root, "negative.out.json"), join(root, "negative.baseline.json"));
    const original = summarize("original", base.requirements.taskId, originalPath, originalRun, effort(1, 0));
    const positive = summarize("positive", positiveDoc.requirements.taskId, positivePath, positiveRun, effort(1, 0));
    const later = summarize("later", laterDoc.requirements.taskId, laterPath, laterRun, effort(1, 0));
    const negative = summarize("negative", negativeDoc.requirements.taskId, negativePath, negativeRun, effort(1, 0));
    positive.directBaseline = directBaseline(positiveRun);
    later.directBaseline = directBaseline(laterRun);
    negative.directBaseline = directBaseline(negativeRun);
    if (original.status !== "utility_ok_not_release" || positive.status !== "utility_ok_not_release" || later.status !== "utility_ok_not_release") {
      throw new Error("expected utility_ok_not_release on the original, changed, and later inputs");
    }
    if (original.readyForRelease !== false || later.readyForRelease !== false || positive.readyForRelease !== false) {
      throw new Error("utility_ok_not_release is not release acceptance");
    }
    if (later.inputSha256 === original.inputSha256 || positive.inputSha256 === original.inputSha256) {
      throw new Error("changed later input did not change the input bytes");
    }
    if (!negative.failures.includes("not_string:title") || negative.status !== "integrated_partial") {
      throw new Error("expected a useful negative for the missing title field");
    }
    if (negative.readyForRelease !== false || negative.accepted !== false) {
      throw new Error("useful negative is not a release");
    }
    if (sha256File(subjectArchive) !== archiveSha256) {
      throw new Error("frozen subject bytes were rewritten");
    }
    const measurement = {
      schema: SCHEMA_MEASUREMENT,
      offerId: OFFER_ID,
      evidenceClass: "sponsored_evaluation",
      organicCustomer: false,
      customerRevenue: false,
      archiveSha256,
      frozenSubjectBytesRewritten: false,
      documentedExtractDirectory: DOCUMENTED_EXTRACT_DIR,
      documentedPathExists: existsSync(documented),
      workingExtractDirectory: WORKING_EXTRACT_DIR,
      entry: KIT_ENTRY,
      recipe: {
        documented: "tar -xzf capability-preflight.tar.gz && cd s180-capability-consumer-kit && node bin/capability-consumer-kit.mjs journey --input fixtures/journey-input.json --out report.json",
        documentedWorks: false,
        reason: "extract_root_mismatch",
        correct: "tar -xzf capability-preflight.tar.gz && cd capability-preflight && node bin/capability-consumer-kit.mjs journey --input fixtures/journey-input.json --out report.json",
        bound: "Artifact summary is a string. Artifact title is absent. A summary_len bound can pass. A title string_max_length bound returns not_string:title and status integrated_partial. utility_ok_not_release is not release acceptance.",
      },
      original,
      positive,
      later,
      negative,
      completionQuality: {
        original: "utility_ok_not_release",
        positive: "utility_ok_not_release",
        later: "utility_ok_not_release",
        negative: "useful_negative",
        releaseAcceptance: false,
      },
      contributorEffort: {
        suppliedCommandsPerArm: 1,
        unit: "commands",
        tokenReceipts: { kind: "unknown" },
        commandCountIsEngineeringSavings: false,
      },
      rootReviewEffort: {
        activeReviewPerArm: 1,
        subjectByteAmendments: 0,
        frozenSubjectRewritten: false,
        unit: "commands",
        tokenReceipts: { kind: "unknown" },
      },
      reuseGain: null,
      amendmentNote: "baselineNegative.requesterAmendments is the hypothetical retarget a reader would make if only utility_ok counted. The frozen subject was not rewritten. That difference is not a reuse gain.",
      arms: {
        documentedPathOnly: {
          equallyEquipped: false,
          usefulCompletion: false,
          reason: "extract_root_mismatch",
          contributorCommands: 1,
          requesterAmendments: 1,
        },
        baselinePositive: {
          equallyEquipped: true,
          usefulCompletion: true,
          executed: true,
          exitCode: positiveRun.exitCode,
          stableSha256: positive.stableSha256,
          contributorCommands: 1,
          requesterVerification: 1,
          requesterAmendments: 0,
          savingsClaim: null,
          reuseGain: null,
          tokenReceipts: { kind: "unknown" },
        },
        receiptPositive: {
          equallyEquipped: true,
          usefulCompletion: true,
          contributorCommands: 1,
          requesterVerification: 1,
          requesterAmendments: 0,
          savingsClaim: null,
          reuseGain: null,
          tokenReceipts: { kind: "unknown" },
        },
        baselineNegative: {
          equallyEquipped: true,
          usefulCompletion: false,
          reason: "kit_status_is_not_utility_ok",
          executed: true,
          exitCode: negativeRun.exitCode,
          status: negative.status,
          sameStableSha256AsReceipt: true,
          contributorCommands: 1,
          requesterVerification: 1,
          requesterAmendments: 1,
          reuseGain: null,
          tokenReceipts: { kind: "unknown" },
        },
        receiptNegative: {
          equallyEquipped: true,
          usefulCompletion: true,
          outcome: "useful_negative",
          contributorCommands: 1,
          requesterVerification: 1,
          requesterAmendments: 0,
          savingsClaim: null,
          reuseGain: null,
          tokenReceipts: { kind: "unknown" },
        },
      },
      compatibility: {
        id: COMPAT_ID,
        appliesToChangedTask: true,
        agreedNegative: "not_string:title",
        summary: "Use extract directory capability-preflight. Keep string bounds on artifact fields that are strings. A missing title check is a useful negative, not a release and not an endorsement.",
      },
      tokenReceipts: { kind: "unknown" },
      durationIsEngineeringSavings: false,
      otherPacks: repoRoot ? otherPacks(repoRoot) : {
        skipped: true,
        reason: "no_parent_checkout",
      },
      hosted: {
        providerDbEnrollment: "unavailable",
        kernelBooted: false,
        replacementDatabaseProvisioned: false,
      },
    };
    return redactPaths(measurement);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
