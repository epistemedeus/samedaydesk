import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

export const KIND = Object.freeze({
  PRICING_ROWS: "pricing-rows",
  OPENAPI: "openapi",
  USED_OPERATIONS: "used-operations",
  FEED_XML: "feed-xml",
  EVIDENCE_PACKET: "evidence-packet",
  LISTING_DIAGNOSIS: "listing-diagnosis",
  NEXT_RUN: "next-run-manifest",
  HTML: "html",
  JSON_UNKNOWN: "json-unknown",
  XML_UNKNOWN: "xml-unknown",
  OTHER: "other",
  MISSING: "missing",
});

const MAX_SNIFF_BYTES = 1_048_576;

function readBounded(filePath) {
  const st = statSync(filePath);
  if (!st.isFile()) return { text: null, tooLarge: false, isDir: true };
  if (st.size > MAX_SNIFF_BYTES) return { text: null, tooLarge: true, isDir: false };
  return { text: readFileSync(filePath, "utf8"), tooLarge: false, isDir: false };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksPricing(doc) {
  if (!isPlainObject(doc) || !Array.isArray(doc.rows) || doc.rows.length === 0) return false;
  return doc.rows.every(
    (row) =>
      isPlainObject(row) &&
      typeof row.field === "string" &&
      Object.prototype.hasOwnProperty.call(row, "value") &&
      typeof row.unit === "string",
  );
}

function looksUsedOps(doc) {
  if (!isPlainObject(doc) || !Array.isArray(doc.operations) || doc.operations.length === 0) return false;
  return doc.operations.every(
    (op) => isPlainObject(op) && typeof op.method === "string" && typeof op.path === "string",
  );
}

function looksEvidence(doc) {
  if (!isPlainObject(doc)) return false;
  const schema = String(doc.schema || "");
  return (
    schema.includes("consumer-evidence") ||
    (typeof doc.decision === "string" && Array.isArray(doc.findings) && Array.isArray(doc.citations))
  );
}

function looksListing(doc) {
  if (!isPlainObject(doc)) return false;
  const schema = String(doc.schema || "");
  if (schema.includes("distribution_repair") || schema.includes("listing")) return true;
  return Boolean(doc.identity && (doc.discovery || doc.record));
}

function looksNextRun(doc) {
  if (!isPlainObject(doc)) return false;
  const schema = String(doc.schema || "");
  if (schema.includes("next-run-manifest")) return true;
  return Boolean(doc.recipeId && doc.currentInputs);
}

function looksOpenApiText(text, doc) {
  if (doc && isPlainObject(doc) && (typeof doc.openapi === "string" || typeof doc.swagger === "string")) {
    return true;
  }
  return /^\s*(openapi|swagger)\s*:/i.test(text);
}

function looksFeed(text) {
  return /<(rss|feed|RDF)\b/i.test(text);
}

function looksHtml(text, filePath) {
  if (extname(filePath).toLowerCase() === ".html" || extname(filePath).toLowerCase() === ".htm") return true;
  return /^\s*<(!DOCTYPE\s+html|html)\b/i.test(text);
}

export function sniffFile(filePath) {
  const name = basename(filePath);
  if (!existsSync(filePath)) {
    return { path: filePath, name, kind: KIND.MISSING, error: "file-not-found" };
  }
  const bounded = readBounded(filePath);
  if (bounded.isDir) return { path: filePath, name, kind: KIND.OTHER, error: "not-a-file" };
  if (bounded.tooLarge) return { path: filePath, name, kind: KIND.OTHER, error: "oversize" };
  const text = bounded.text || "";
  const trimmed = text.trim();

  if (looksHtml(text, filePath)) {
    return { path: filePath, name, kind: KIND.HTML };
  }

  const doc = trimmed.startsWith("{") || trimmed.startsWith("[") ? parseJson(trimmed) : null;
  if (doc) {
    if (looksPricing(doc)) return { path: filePath, name, kind: KIND.PRICING_ROWS };
    if (looksUsedOps(doc)) return { path: filePath, name, kind: KIND.USED_OPERATIONS };
    if (looksEvidence(doc)) return { path: filePath, name, kind: KIND.EVIDENCE_PACKET };
    if (looksNextRun(doc)) return { path: filePath, name, kind: KIND.NEXT_RUN };
    if (looksListing(doc)) return { path: filePath, name, kind: KIND.LISTING_DIAGNOSIS };
    if (looksOpenApiText(text, doc)) return { path: filePath, name, kind: KIND.OPENAPI };
    return { path: filePath, name, kind: KIND.JSON_UNKNOWN };
  }

  if (looksOpenApiText(text, null)) return { path: filePath, name, kind: KIND.OPENAPI };
  if (looksFeed(text)) return { path: filePath, name, kind: KIND.FEED_XML };
  if (/^\s*</.test(trimmed)) return { path: filePath, name, kind: KIND.XML_UNKNOWN };
  return { path: filePath, name, kind: KIND.OTHER };
}

function assignPair(files, kind, beforeFlag, afterFlag) {
  const pair = files.filter((f) => f.kind === kind);
  if (pair.length !== 2) return null;
  const namedBefore = pair.find((f) => /before/i.test(f.name));
  const namedAfter = pair.find((f) => /after/i.test(f.name));
  let ordered = pair;
  let orderRule = "files-order";
  if (namedBefore && namedAfter && namedBefore !== namedAfter) {
    ordered = [namedBefore, namedAfter];
    orderRule = "filename-before-after";
  }
  return {
    inputs: [
      { flag: beforeFlag, path: ordered[0].path, kind, role: "before" },
      { flag: afterFlag, path: ordered[1].path, kind, role: "after" },
    ],
    orderRule,
  };
}

export function chooseFromFiles(filePaths) {
  const sniffed = filePaths.map((p) => sniffFile(p));
  const missing = sniffed.filter((f) => f.kind === KIND.MISSING);
  if (missing.length) {
    return {
      ok: false,
      code: "input-missing-file",
      error: `File not found: ${missing.map((f) => f.path).join(", ")}`,
      files: sniffed,
    };
  }

  const html = sniffed.filter((f) => f.kind === KIND.HTML);
  if (html.length && sniffed.every((f) => f.kind === KIND.HTML || f.kind === KIND.PRICING_ROWS)) {
    return {
      ok: false,
      code: "unsupported-input-kind",
      error: "HTML is not pricing-row JSON. vendor-budget-impact needs JSON objects with rows[].field, value, and unit.",
      files: sniffed,
      jobId: "vendor-budget-impact",
      usefulIfRun: "A run on HTML is a valid analysis refusal, not a crash, but it is the wrong input.",
    };
  }

  const pricing = assignPair(sniffed, KIND.PRICING_ROWS, "--before", "--after");
  if (pricing && sniffed.every((f) => f.kind === KIND.PRICING_ROWS)) {
    return recommend("vendor-budget-impact", sniffed, pricing.inputs, pricing.orderRule);
  }

  const feeds = assignPair(sniffed, KIND.FEED_XML, "--before", "--after");
  if (feeds && sniffed.every((f) => f.kind === KIND.FEED_XML)) {
    return recommend("feed-agenda", sniffed, feeds.inputs, feeds.orderRule);
  }

  const openapi = sniffed.filter((f) => f.kind === KIND.OPENAPI);
  const used = sniffed.filter((f) => f.kind === KIND.USED_OPERATIONS);
  if (openapi.length === 2 && used.length === 1 && sniffed.length === 3) {
    const pair = assignPair(openapi, KIND.OPENAPI, "--before", "--after");
    return recommend("api-upgrade-brief", sniffed, [...pair.inputs, { flag: "--used", path: used[0].path, kind: KIND.USED_OPERATIONS, role: "used" }], pair.orderRule);
  }

  if (sniffed.length === 1 && sniffed[0].kind === KIND.EVIDENCE_PACKET) {
    return recommend("evidence-ci-annotation", sniffed, [
      { flag: "--input", path: sniffed[0].path, kind: KIND.EVIDENCE_PACKET, role: "input" },
    ]);
  }

  if (sniffed.length === 1 && sniffed[0].kind === KIND.LISTING_DIAGNOSIS) {
    return recommend("listing-repair-packet", sniffed, [
      { flag: "--input", path: sniffed[0].path, kind: KIND.LISTING_DIAGNOSIS, role: "input" },
    ]);
  }

  if (sniffed.length === 1 && sniffed[0].kind === KIND.NEXT_RUN) {
    return recommend("repeat-job-record", sniffed, [
      { flag: "--next-run", path: sniffed[0].path, kind: KIND.NEXT_RUN, role: "next-run" },
    ]);
  }

  if (used.length && openapi.length < 2) {
    return {
      ok: false,
      code: "incomplete-input-set",
      error: "api-upgrade-brief needs --before OpenAPI, --after OpenAPI, and --used operations JSON.",
      files: sniffed,
      jobId: "api-upgrade-brief",
    };
  }

  return {
    ok: false,
    code: "cannot-choose-job",
    error: "Files do not match one advertised job input set. Use choose --job <id> to read required flags.",
    files: sniffed,
  };
}

function recommend(jobId, files, inputs, orderRule = null) {
  return {
    ok: true,
    jobId,
    files,
    inputs,
    orderRule,
    wrapperArgs: inputs.flatMap((i) => [i.flag, i.path]),
  };
}
