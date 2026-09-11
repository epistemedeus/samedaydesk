/** Fixture constructor for samedaydesk.extract-batch.v0. Not a compare engine. */

export const EXTRACT_PRODUCT = "samedaydesk-extract-batch";
export const EXTRACT_SCHEMA = "samedaydesk.extract-batch.v0";

const QUOTE = {
  amountAtomic: "10000",
  displayUsdc: "0.01",
  meaning: "Introductory flat 0.01 USDC batch quote for a bounded 1-5 URL attempt. Not a per-URL success promise.",
};

const BOUNDARY = {
  guaranteedUrlSuccess: false,
  introductoryPrice: true,
  sourceFetchBeforeAuthorization: false,
  automaticRetries: false,
};

export function sourceRow({
  id,
  source,
  status = "success",
  data,
  notes = [],
  error = null,
  httpStatus = 200,
  fetchedAt,
  completedAt,
  requestedAt,
  extraData,
} = {}) {
  const payload = extraData ? { ...data, ...extraData } : data;
  return {
    id,
    source,
    status,
    data: status === "success" || status === "partial" ? payload : payload ?? null,
    notes,
    error,
    finalUrl: source,
    httpStatus,
    provenance: {
      transport: "held-snapshot",
      requestedAt: requestedAt ?? fetchedAt,
      completedAt: completedAt ?? fetchedAt,
      fetchedAt,
      finalUrl: source,
      httpStatus,
    },
  };
}

export function extractBatch({
  jobId,
  charged = false,
  ok = true,
  jobStatus = "completed",
  partial = false,
  sources,
  bytes = 1600,
  wallMs = 40,
} = {}) {
  const succeeded = sources.filter((row) => row.status === "success").length;
  const failed = sources.filter((row) => row.status === "failure").length;
  const unknown = sources.filter((row) => row.status === "unknown").length;
  return {
    ok,
    product: EXTRACT_PRODUCT,
    schemaVersion: EXTRACT_SCHEMA,
    quote: QUOTE,
    jobId,
    jobStatus,
    stopReason: null,
    partial,
    sources,
    accounting: {
      requests: sources.length,
      bytes,
      wallMs,
      retries: 0,
      succeeded,
      partial: 0,
      failed,
      unknown,
      skippedDuplicate: 0,
    },
    costInputs: {
      admittedBodyBytes: bytes,
      requests: sources.length,
      wallMs,
      hostingCosts: "unknown",
      modelCosts: "none",
      monetaryMargin: null,
    },
    charged,
    boundary: BOUNDARY,
  };
}

export const BASE_LEAD = Object.freeze({
  title: "Northshore fastener lead sheet",
  description: "Grade 8 hex bolts. Lead time 14 days. Unit price 12.40 USD.",
  headings: { h1: ["Northshore Fasteners"], h2: ["Lead times", "Grades"] },
});

export const BASE_GRADE = Object.freeze({
  title: "Northshore grade chart",
  description: "Grade 5 and Grade 8 hex listed.",
  headings: { h1: ["Grades"], h2: ["Hex", "Carriage"] },
});

export const BASE_PACK = Object.freeze({
  title: "Northshore packaging notes",
  description: "Cartons of 100. Pallet 40 cartons.",
  headings: { h1: ["Packaging"], h2: ["Carton", "Pallet"] },
});
