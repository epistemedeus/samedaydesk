import { createHash } from "node:crypto";

export function jobIdFor(label) {
  return createHash("sha256").update(`w5-m09-fei:${label}`).digest("hex");
}

export function heldExtractBatch({
  jobId,
  source,
  data,
  fetchedAt,
  id = "item-001",
  status = "success",
  error = null,
  extraSources = [],
}) {
  const row = {
    id,
    source,
    status,
    data,
    notes: [],
    error,
    finalUrl: source,
    httpStatus: status === "success" ? 200 : 0,
    provenance: {
      transport: "held-git-show",
      requestedAt: fetchedAt,
      completedAt: fetchedAt,
      fetchedAt,
      finalUrl: source,
      httpStatus: status === "success" ? 200 : 0,
      note: "Observation timestamps record when this wrapper was produced from git show. They are not page-content freshness.",
    },
  };
  const sources = [row, ...extraSources];
  const succeeded = sources.filter((item) => item.status === "success").length;
  const failed = sources.filter((item) => item.status === "failure").length;
  const unknown = sources.filter((item) => item.status === "unknown").length;
  return {
    ok: failed === 0 && unknown === 0,
    product: "samedaydesk-extract-batch",
    schemaVersion: "samedaydesk.extract-batch.v0",
    quote: {
      amountAtomic: "0",
      displayUsdc: "0.00",
      meaning: "Caller-owned held extract-batch wrapper over git-show HTML facts. Not a live fetch, quote-as-success, or payment.",
    },
    jobId,
    jobStatus: "completed",
    stopReason: null,
    partial: failed > 0 || unknown > 0,
    sources,
    accounting: {
      requests: sources.length,
      bytes: 0,
      wallMs: 1,
      retries: 0,
      succeeded,
      partial: 0,
      failed,
      unknown,
      skippedDuplicate: 0,
    },
    costInputs: {
      admittedBodyBytes: 0,
      requests: sources.length,
      wallMs: 1,
      hostingCosts: "none",
      modelCosts: "none",
      monetaryMargin: null,
      note: "Held git-show extraction; not socket billing.",
    },
    charged: false,
    boundary: {
      guaranteedUrlSuccess: false,
      introductoryPrice: false,
      sourceFetchBeforeAuthorization: false,
      automaticRetries: false,
    },
  };
}

export function sourceRow({
  id,
  source,
  data,
  fetchedAt,
  status = "success",
  error = null,
}) {
  return {
    id,
    source,
    status,
    data,
    notes: [],
    error,
    finalUrl: source,
    httpStatus: status === "success" ? 200 : 0,
    provenance: {
      transport: "held-git-show",
      requestedAt: fetchedAt,
      completedAt: fetchedAt,
      fetchedAt,
      finalUrl: source,
      httpStatus: status === "success" ? 200 : 0,
      note: "Observation timestamps record when this wrapper was produced from git show. They are not page-content freshness.",
    },
  };
}
