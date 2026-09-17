import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadCommittedCatalog, promisedOutputs } from "./catalog.mjs";
import {
  extractJsonObjects,
  parseableErrorFields,
  parseableErrorFromProcess,
} from "./parse-error.mjs";

export const FAILURES = Object.freeze({
  missing_output_reported_delivered:
    "Desk report claimed delivered while a catalog-promised output file is missing",
  unparseable_error: "Failure is not parseable JSON with ok:false and error or code",
  delivered_claim_on_failure: "Failure report also claimed delivered",
  missing_report: "Desk report is missing or not a JSON object",
  usage: "CLI usage error",
});

export function fail(failureClass, message, extra = {}) {
  const cls = FAILURES[failureClass] ? failureClass : "unparseable_error";
  return {
    ok: false,
    refused: true,
    parseable: true,
    code: cls,
    error: String(message || FAILURES[cls] || FAILURES.unparseable_error),
    failure: {
      class: cls,
      message: String(message || FAILURES[cls] || FAILURES.unparseable_error),
      ...extra,
    },
  };
}

export function claimsDelivered(report) {
  if (!report || typeof report !== "object") return false;
  if (report.delivered === true) return true;
  if (report.status === "delivered") return true;
  if (report.delivery?.complete === true) return true;
  if (report.delivery?.status === "complete") return true;
  if (report.ok === true && report.refused !== true) return true;
  return false;
}

function isPresentFile(outDir, name) {
  if (!outDir) return false;
  const p = join(outDir, name);
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

export function inspectOutputs(outDir, expected) {
  const names = [...(expected || [])];
  const present = names.filter((name) => isPresentFile(outDir, name));
  const missing = names.filter((name) => !present.includes(name));
  return { expected: names, present, missing, complete: names.length > 0 && missing.length === 0 };
}

export function resolveReportOutDir(report, { reportPath = null, outDir = null } = {}) {
  if (outDir) return resolve(outDir);
  const declared = report?.outDir || report?.runOutDir || report?.delivery?.outDir || null;
  if (!declared) return null;
  if (isAbsolute(declared)) return declared;
  const base = reportPath ? resolve(reportPath, "..") : process.cwd();
  return resolve(base, declared);
}

/**
 * Black-box honesty check for a useful-job desk report.
 * Does not import engines or J6 desk internals.
 */
export function checkDeskReport(report, options = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return fail("missing_report", "desk report is not a JSON object");
  }

  const catalog = options.catalog || loadCommittedCatalog();
  const jobId = report.jobId || report.appId || options.jobId || null;
  const expected = promisedOutputs(jobId, report, catalog);
  const outDir = resolveReportOutDir(report, options);
  const files = inspectOutputs(outDir, expected);
  const deliveredClaim = claimsDelivered(report);
  const parseableFailure = parseableErrorFields(report);

  if (deliveredClaim && files.missing.length) {
    return fail(
      "missing_output_reported_delivered",
      `missing output cannot report delivered: ${files.missing.join(", ")}`,
      {
        seeded: options.seeded === true ? "missing_output_reported_delivered" : undefined,
        jobId,
        outDir,
        expected: files.expected,
        present: files.present,
        missing: files.missing,
        deliveredClaim: true,
      },
    );
  }

  if (deliveredClaim) {
    return {
      ok: true,
      honest: true,
      delivered: true,
      jobId,
      outDir,
      expected: files.expected,
      present: files.present,
      missing: [],
    };
  }

  if (!parseableFailure) {
    return fail(
      "unparseable_error",
      "failure is not parseable JSON with ok:false and error or code",
      { jobId, outDir, expected: files.expected, present: files.present, missing: files.missing },
    );
  }

  if (report.delivered === true || report.status === "delivered" || report.delivery?.complete === true) {
    return fail("delivered_claim_on_failure", "failure report also claimed delivered", {
      jobId,
      outDir,
    });
  }

  return {
    ok: true,
    honest: true,
    delivered: false,
    parseableError: true,
    jobId,
    code: parseableFailure.code,
    error: parseableFailure.error,
    outDir,
    expected: files.expected,
    present: files.present,
    missing: files.missing,
  };
}

/**
 * Check a spawned desk CLI result. Exit 0 may only stand when promised
 * outputs exist as files. Nonzero exit requires a parseable error object.
 */
export function checkDeskProcess(proc, options = {}) {
  const status = proc?.status;
  const stdout = String(proc?.stdout || "");
  const stderr = String(proc?.stderr || "");
  const objects = [...extractJsonObjects(stdout), ...extractJsonObjects(stderr)];
  const report =
    objects.find((o) => o && typeof o === "object" && (o.ok === true || o.ok === false)) ||
    objects[0] ||
    null;

  const merged = report
    ? {
        ...report,
        jobId: report.jobId || report.appId || options.jobId,
        outDir: options.outDir || report.outDir,
      }
    : null;

  if (status === 0) {
    if (!merged) {
      return fail("unparseable_error", "exit 0 without a parseable desk report", {
        status,
        stdoutPreview: stdout.slice(0, 200),
      });
    }
    const checked = checkDeskReport(
      { ...merged, ok: merged.ok !== false },
      { ...options, outDir: options.outDir || merged.outDir },
    );
    if (checked.ok !== true) return { ...checked, status };
    return { ...checked, status };
  }

  const fromProc =
    (parseableErrorFromProcess && parseableErrorFromProcess({ stdout, stderr })) ||
    parseableErrorFields(merged);

  if (merged && claimsDelivered(merged)) {
    const checked = checkDeskReport(merged, { ...options, outDir: options.outDir || merged.outDir });
    if (checked.failure?.class === "missing_output_reported_delivered") {
      return { ...checked, status };
    }
    return fail("delivered_claim_on_failure", "nonzero exit claimed delivered", {
      status,
      jobId: merged.jobId,
    });
  }

  if (!fromProc) {
    return fail("unparseable_error", "nonzero exit without a parseable error object", {
      status,
      stdoutPreview: stdout.slice(0, 200),
      stderrPreview: stderr.slice(0, 200),
    });
  }

  const parsed = fromProc.parsed || fromProc;
  return {
    ok: true,
    honest: true,
    delivered: false,
    parseableError: true,
    status,
    code: parsed.code,
    error: parsed.error,
    jobId: options.jobId || merged?.jobId || null,
  };
}
