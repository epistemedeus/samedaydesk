import { existsSync, readFileSync } from "node:fs";

export const FIELD_EVIDENCE_SCHEMA = "samedaydesk.wave5.d28.live-return-evidence.v1";
export const ALLOWED_LABELS = new Set(["owner-qa", "recruited", "independent"]);

export function absentField(reason = "no-evidence-file") {
  return {
    liveReturn: "absent",
    deployedArtifact: "absent",
    reason,
    label: null,
    sold: false,
    invented: false,
  };
}

/**
 * Live return is only recorded from an explicit evidence file.
 * Missing file is absent, not a fabricated customer.
 */
export function readFieldEvidence(filePath) {
  if (!filePath) return absentField("no-evidence-file");
  if (!existsSync(filePath)) return absentField("evidence-file-missing");
  let body;
  try {
    body = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    return {
      liveReturn: "invalid",
      deployedArtifact: "absent",
      reason: "evidence-unreadable",
      error: err.message,
      sold: false,
      invented: false,
    };
  }
  if (body?.invented === true || body?.customerInvented === true || body?.fabricated === true) {
    return {
      liveReturn: "rejected",
      deployedArtifact: "absent",
      reason: "invented-customer-rejected",
      sold: false,
      invented: true,
    };
  }
  if (body?.schema !== FIELD_EVIDENCE_SCHEMA) {
    return {
      liveReturn: "invalid",
      deployedArtifact: "absent",
      reason: "evidence-schema-mismatch",
      sold: false,
      invented: false,
    };
  }
  if (!ALLOWED_LABELS.has(body.label)) {
    return {
      liveReturn: "invalid",
      deployedArtifact: "absent",
      reason: "evidence-label-not-allowed",
      sold: false,
      invented: false,
    };
  }
  if (body.sold === true) {
    return {
      liveReturn: "invalid",
      deployedArtifact: "absent",
      reason: "sold-true-not-accepted-in-this-kit",
      sold: false,
      invented: false,
    };
  }
  if (!body.jobId || !body.receiptSha256 || !/^[0-9a-f]{64}$/.test(String(body.receiptSha256))) {
    return {
      liveReturn: "invalid",
      deployedArtifact: "absent",
      reason: "evidence-missing-job-or-receipt-sha256",
      sold: false,
      invented: false,
    };
  }
  return {
    liveReturn: body.returnSignal || "observed",
    deployedArtifact: body.deployedArtifact || "absent",
    reason: "evidence-file",
    label: body.label,
    sold: false,
    invented: false,
    observedAt: body.observedAt || null,
    jobId: body.jobId,
    receiptSha256: body.receiptSha256,
  };
}
