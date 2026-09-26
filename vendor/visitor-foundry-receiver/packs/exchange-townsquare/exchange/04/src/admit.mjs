import { ADMISSION_STATUS, ISSUE_KIND, SCHEMA } from "./constants.mjs";
import {
  resolveContractFromBriefOrContract,
  validateFileSetContract,
  validateSubmission,
} from "./validate.mjs";

/**
 * Admit a deliverable file-set submission against a task contract.
 * Distinguishes missing files, unsafe paths, and unsupported formats.
 */
export function admitArtifactSubmission(contractOrBrief, submissionRaw, { clock = () => Date.now() } = {}) {
  const contract = Array.isArray(contractOrBrief?.requiredFiles)
    ? validateFileSetContract(contractOrBrief)
    : resolveContractFromBriefOrContract(contractOrBrief);
  const submission = validateSubmission(submissionRaw);

  const issues = [];
  const acceptedFiles = [];
  const requiredPaths = new Set(contract.requiredFiles.map((f) => f.path));
  const requiredByPath = new Map(contract.requiredFiles.map((f) => [f.path, f]));

  // Index safe submissions by normalized path (unsafe still recorded as issues).
  const byNorm = new Map();

  for (const file of submission.files) {
    if (!file.pathInfo.ok) {
      issues.push({
        kind: ISSUE_KIND.UNSAFE_PATH,
        path: file.path,
        reason: file.pathInfo.reason,
      });
      continue;
    }

    const format = file.format;
    if (!format || !contract.allowedFormats.includes(format)) {
      issues.push({
        kind: ISSUE_KIND.UNSUPPORTED_FORMAT,
        path: file.normalizedPath,
        format,
        allowedFormats: contract.allowedFormats,
      });
      continue;
    }

    const required = requiredByPath.get(file.normalizedPath);
    if (required?.format && format !== required.format) {
      issues.push({
        kind: ISSUE_KIND.UNSUPPORTED_FORMAT,
        path: file.normalizedPath,
        format,
        expectedFormat: required.format,
      });
      continue;
    }

    if (file.byteLength > contract.maxBytesPerFile) {
      issues.push({
        kind: ISSUE_KIND.OVERSIZE_FILE,
        path: file.normalizedPath,
        byteLength: file.byteLength,
        maxBytesPerFile: contract.maxBytesPerFile,
      });
      continue;
    }

    if (!requiredPaths.has(file.normalizedPath) && !contract.allowExtraFiles) {
      issues.push({
        kind: ISSUE_KIND.UNEXPECTED_FILE,
        path: file.normalizedPath,
      });
      continue;
    }

    byNorm.set(file.normalizedPath, file);
    acceptedFiles.push({
      path: file.normalizedPath,
      format,
      byteLength: file.byteLength,
      required: requiredPaths.has(file.normalizedPath),
    });
  }

  for (const req of contract.requiredFiles) {
    if (!byNorm.has(req.path)) {
      // If an unsafe/unsupported file was submitted under a different raw path, still missing.
      issues.push({
        kind: ISSUE_KIND.MISSING_FILE,
        path: req.path,
        expectedFormat: req.format,
      });
    }
  }

  const totalBytes = acceptedFiles.reduce((sum, f) => sum + f.byteLength, 0);
  if (totalBytes > contract.maxTotalBytes) {
    issues.push({
      kind: ISSUE_KIND.OVERSIZE_TOTAL,
      totalBytes,
      maxTotalBytes: contract.maxTotalBytes,
    });
  }

  const missing = issues.filter((i) => i.kind === ISSUE_KIND.MISSING_FILE);
  const unsafe = issues.filter((i) => i.kind === ISSUE_KIND.UNSAFE_PATH);
  const unsupported = issues.filter((i) => i.kind === ISSUE_KIND.UNSUPPORTED_FORMAT);
  const unexpected = issues.filter((i) => i.kind === ISSUE_KIND.UNEXPECTED_FILE);
  const blocking = issues.filter((i) =>
    [
      ISSUE_KIND.MISSING_FILE,
      ISSUE_KIND.UNSAFE_PATH,
      ISSUE_KIND.UNSUPPORTED_FORMAT,
      ISSUE_KIND.OVERSIZE_FILE,
      ISSUE_KIND.OVERSIZE_TOTAL,
      ISSUE_KIND.UNEXPECTED_FILE,
    ].includes(i.kind),
  );

  let status = ADMISSION_STATUS.ADMITTED;
  if (unsafe.length > 0 || unsupported.length > 0 || unexpected.length > 0) {
    status = ADMISSION_STATUS.REJECTED;
  } else if (issues.some((i) => i.kind === ISSUE_KIND.OVERSIZE_FILE || i.kind === ISSUE_KIND.OVERSIZE_TOTAL)) {
    status = ADMISSION_STATUS.REJECTED;
  } else if (missing.length > 0 && acceptedFiles.some((f) => f.required)) {
    status = ADMISSION_STATUS.PARTIAL;
  } else if (missing.length > 0) {
    status = ADMISSION_STATUS.REJECTED;
  } else if (blocking.length > 0) {
    status = ADMISSION_STATUS.REJECTED;
  } else {
    status = ADMISSION_STATUS.ADMITTED;
  }

  return {
    schema: SCHEMA,
    admittedAt: new Date(clock()).toISOString(),
    taskId: contract.taskId,
    status,
    contract: {
      requiredFiles: contract.requiredFiles,
      allowedFormats: contract.allowedFormats,
      maxBytesPerFile: contract.maxBytesPerFile,
      maxTotalBytes: contract.maxTotalBytes,
      allowExtraFiles: contract.allowExtraFiles,
    },
    acceptedFiles,
    issues,
    summary: {
      missingFileCount: missing.length,
      unsafePathCount: unsafe.length,
      unsupportedFormatCount: unsupported.length,
      unexpectedFileCount: unexpected.length,
      issueCount: issues.length,
      acceptedCount: acceptedFiles.length,
      totalAcceptedBytes: totalBytes,
    },
    consumerInstructions: [
      "1. Provide a file-set contract (requiredFiles + allowedFormats) or a brief with bounds.fileSetContract / deliverableContract.",
      "2. Submit files: [{ path, byteLength, format? }] — relative POSIX paths only.",
      "3. Read status admitted|partial|rejected and issues[].kind: missing_file, unsafe_path, unsupported_format.",
      "4. Unsafe paths and unsupported formats reject; some required present + some missing → partial.",
      "5. No revenue/ranking fields.",
    ].join("\n"),
  };
}

export { resolveContractFromBriefOrContract, validateFileSetContract, validateSubmission };
