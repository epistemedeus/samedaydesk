/**
 * Wrap derived markdown facts as samedaydesk.extract-batch.v0.
 * Held local artifact. Not a live fetch, payment, or hosted extract.
 */
import { createHash } from "node:crypto";
import { extractMarkdownFacts, SELECTED_FIELDS } from "./md-facts.mjs";

export const EXTRACT_PRODUCT = "samedaydesk-extract-batch";
export const EXTRACT_SCHEMA = "samedaydesk.extract-batch.v0";
export const SOURCE_KEY = "held:expressjs/expressjs.com:docs/content.md";
export { SELECTED_FIELDS };

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function wrapHeldExtractBatch({
  markdown,
  role,
  gitSha,
  blobSha,
  byteLength,
  sha256,
  observedAt,
}) {
  const facts = extractMarkdownFacts(markdown);
  const bodyBytes = Buffer.byteLength(String(markdown), "utf8");
  const jobId = sha256Hex(
    Buffer.from(`p02-express-docs:${role}:${gitSha}:${sha256}`, "utf8"),
  );
  return {
    ok: true,
    product: EXTRACT_PRODUCT,
    schemaVersion: EXTRACT_SCHEMA,
    quote: {
      amountAtomic: "0",
      displayUsdc: "0.00",
      meaning:
        "Caller-owned held extract-batch wrapper over already-retrieved expressjs.com docs/content.md. Not a live fetch, quote-as-success, or payment. Markdown-to-extract-batch is a labeled non-equivalent projection.",
    },
    jobId,
    jobStatus: "completed",
    stopReason: null,
    partial: false,
    sources: [
      {
        id: `item-${role}`,
        source: SOURCE_KEY,
        status: "success",
        data: {
          title: facts.title,
          headings: facts.headings,
          text: facts.text,
        },
        notes: [
          "Derived title/headings/text from ATX markdown. Unselected markup is dropped.",
          `gitSha=${gitSha}`,
          `gitBlobSha=${blobSha}`,
          `markdownSha256=${sha256}`,
        ],
        error: null,
        provenance: {
          transport: "held-github-raw",
          requestedAt: observedAt,
          completedAt: observedAt,
          fetchedAt: observedAt,
          gitSha,
          path: "docs/content.md",
          markdownBytes: byteLength ?? bodyBytes,
          markdownSha256: sha256,
          gitBlobSha: blobSha,
          note: "Observation timestamps record when this wrapper was produced from already-held GitHub raw bytes. They are not page-content freshness.",
        },
      },
    ],
    accounting: {
      requests: 1,
      bytes: bodyBytes,
      wallMs: 0,
      retries: 0,
      succeeded: 1,
      partial: 0,
      failed: 0,
      unknown: 0,
      skippedDuplicate: 0,
    },
    costInputs: {
      admittedBodyBytes: bodyBytes,
      requests: 1,
      wallMs: 0,
      hostingCosts: "none",
      modelCosts: "none",
      monetaryMargin: null,
      note: "Held GitHub-raw extraction; not socket billing.",
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
