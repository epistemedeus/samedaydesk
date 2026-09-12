/**
 * Caller-owned projection of SPDX html/MIT.html + jsonld/MIT.jsonld into
 * samedaydesk.extract-batch.v0. HTML is not extract-batch (non-equivalent).
 * CrossRef timestamps and blank-node ids are generator noise and are dropped.
 */
import { createHash } from "node:crypto";

export const EXTRACT_PRODUCT = "samedaydesk-extract-batch";
export const EXTRACT_SCHEMA = "samedaydesk.extract-batch.v0";
export const SELECTED_FIELDS = Object.freeze(["title", "headings", "text", "jsonLd"]);
export const CONTROL_FIELDS = Object.freeze(["title", "headings"]);
export const SOURCE_KEY = "held:spdx/license-list-data/html/MIT.html";
export const JOB_CLOCK = "2026-09-12T12:00:00.000Z";

export const OFFICIAL = Object.freeze({
  repo: "spdx/license-list-data",
  htmlPath: "html/MIT.html",
  jsonldPath: "jsonld/MIT.jsonld",
  beforeSha: "f75839ee25cde2383fab299f6d8fc94a442f444b",
  afterSha: "7e10095e0c9028c9e7109df00d15db46411a3378",
  beforeDate: "2024-12-19T09:39:35Z",
  afterDate: "2026-04-10T14:35:52Z",
  license: "CC-BY-3.0 AND original MIT license-text terms (SPDX license-list NOTICE)",
});

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function normalizeTitle(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[ \t]+/g, " ").trim();
}

function listedLicense(jsonld) {
  const graph = Array.isArray(jsonld?.["@graph"]) ? jsonld["@graph"] : [];
  return (
    graph.find(
      (node) =>
        node &&
        (node["@type"] === "spdx:ListedLicense" || node["@id"] === "http://spdx.org/licenses/MIT"),
    ) || null
  );
}

function asStringList(value) {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          if (typeof item["@id"] === "string") return item["@id"];
          if (typeof item["@value"] === "string") return item["@value"];
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof value === "object") {
    if (typeof value["@id"] === "string") return [value["@id"]];
    if (typeof value["@value"] === "string") return [value["@value"]];
  }
  return [];
}

function asBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  if (value && typeof value === "object" && Object.hasOwn(value, "@value")) {
    const inner = value["@value"];
    if (typeof inner === "boolean") return inner;
    if (typeof inner === "string") return inner === "true";
  }
  return null;
}

function licenseIdOf(node) {
  const direct = node?.["spdx:licenseId"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const id = typeof node?.["@id"] === "string" ? node["@id"] : "";
  const m = /\/([^/]+)$/.exec(id);
  return m ? m[1] : "MIT";
}

export function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;|&apos;/gi, "'");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&amp;/gi, "&");
  return s.replace(/\s+/g, " ").trim();
}

export function projectJsonLd(jsonld) {
  const node = listedLicense(jsonld);
  if (!node) return null;
  const seeAlso = [...new Set(asStringList(node["rdfs:seeAlso"]))].sort();
  return {
    id: typeof node["@id"] === "string" ? node["@id"] : "http://spdx.org/licenses/MIT",
    type: "spdx:ListedLicense",
    name: typeof node["spdx:name"] === "string" ? node["spdx:name"].trim() : "MIT License",
    licenseId: licenseIdOf(node),
    isOsiApproved: asBool(node["spdx:isOsiApproved"]),
    isFsfLibre: asBool(node["spdx:isFsfLibre"]),
    isDeprecatedLicenseId: asBool(node["spdx:isDeprecatedLicenseId"]),
    seeAlso,
  };
}

export function extractFields(html, jsonld) {
  const projected = projectJsonLd(jsonld);
  const title = normalizeTitle(projected?.name) || normalizeTitle(firstParagraph(html)) || "MIT License";
  const heading = firstOptionalHeading(html) || title;
  return {
    title,
    headings: { h1: [heading] },
    text: htmlToText(html),
    jsonLd: projected,
  };
}

function firstParagraph(html) {
  const m = String(html).match(/<p>\s*([^<]+?)\s*<\/p>/i);
  return m ? m[1] : null;
}

function firstOptionalHeading(html) {
  const m = String(html).match(/optional-license-text[\s\S]*?<p>\s*([^<]+?)\s*<\/p>/i);
  return m ? normalizeTitle(m[1]) : null;
}

export function wrapHeldBatch({
  html,
  jsonld,
  gitSha,
  blobSha,
  htmlSha256,
  jsonldSha256,
  htmlBytes,
  jsonldBytes,
  observedAt,
  side,
} = {}) {
  const data = extractFields(html, jsonld);
  const jobId = sha256Hex(
    Buffer.from(`P03-spdx-mit-html|${side}|${gitSha}|${OFFICIAL.htmlPath}|${OFFICIAL.jsonldPath}`),
  );
  const admitted = Number(htmlBytes || 0) + Number(jsonldBytes || 0);
  return {
    ok: true,
    product: EXTRACT_PRODUCT,
    schemaVersion: EXTRACT_SCHEMA,
    quote: {
      amountAtomic: "0",
      displayUsdc: "0.00",
      meaning:
        "Caller-owned held extract-batch wrapper over GitHub-retrieved SPDX html/MIT.html + jsonld/MIT.jsonld. Not a live fetch, quote-as-success, or payment. HTML is not extract-batch.",
    },
    jobId,
    jobStatus: "completed",
    stopReason: null,
    partial: false,
    sources: [
      {
        id: "item-001",
        source: SOURCE_KEY,
        status: "success",
        data,
        notes: [
          "structured vendor snapshot; not scraping",
          "selected fields: title, headings, text, jsonLd",
          "jsonLd drops CrossRef timestamps and blank-node generator noise",
        ],
        error: null,
        provenance: {
          transport: "held-github-raw+contents",
          repo: OFFICIAL.repo,
          gitSha,
          blobSha: blobSha ?? null,
          htmlPath: OFFICIAL.htmlPath,
          jsonldPath: OFFICIAL.jsonldPath,
          htmlSha256,
          jsonldSha256,
          requestedAt: observedAt,
          completedAt: observedAt,
          fetchedAt: observedAt,
          note: "Observation timestamps record when this wrapper was produced from held bytes. They are not page-content freshness.",
        },
      },
    ],
    accounting: {
      requests: 0,
      bytes: admitted,
      wallMs: 0,
      retries: 0,
      succeeded: 1,
      partial: 0,
      failed: 0,
      unknown: 0,
      skippedDuplicate: 0,
    },
    costInputs: {
      admittedBodyBytes: admitted,
      requests: 0,
      wallMs: 0,
      hostingCosts: "none",
      modelCosts: "none",
      monetaryMargin: null,
      note: "Held GitHub retrieval; not socket billing.",
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

export function pickSourceData(batch) {
  if (!batch || typeof batch !== "object") return null;
  if (Array.isArray(batch.sources) && batch.sources[0] && typeof batch.sources[0].data === "object") {
    return batch.sources[0].data;
  }
  if (batch.data && typeof batch.data === "object") return batch.data;
  if (Object.hasOwn(batch, "title") || Object.hasOwn(batch, "text") || Object.hasOwn(batch, "jsonLd")) {
    return batch;
  }
  return null;
}
