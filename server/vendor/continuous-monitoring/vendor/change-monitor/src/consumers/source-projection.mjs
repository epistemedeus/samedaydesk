import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCHEMA_VERSION, SOURCE_IDS } from "../../vendor/s12-observatory/contract.js";
import { parseSnapshot } from "../../vendor/s12-observatory/envelope.js";
import { fetchObservatoryJson } from "../../vendor/s12-observatory/fetch-observatory.js";
import {
  applySourceUpdate,
  projectSnapshot,
  PROJECTION_ID,
  PROJECTION_SCHEMA,
  rejectSeededFailure,
} from "../../vendor/s12-observatory/projection.js";

import { MonitorError } from "../errors.mjs";

const vendorDir = fileURLToPath(new URL("../../vendor/s12-observatory/", import.meta.url));
const provenance = JSON.parse(readFileSync(join(vendorDir, "PROVENANCE.json"), "utf8"));

export const PUBLIC_SNAPSHOT_URL = "https://samedaydesk.com/api/observatory/snapshot";
export const PROJECTION_COMMIT = provenance.commit;
export const PROJECTION_SHA256 = provenance.files["projection.js"].sha256;

export const projectionIntegration = Object.freeze({
  status: "maintained",
  integration: "maintained",
  tipIncludesS12Writer: false,
  consumedFrom: {
    repository: provenance.repository,
    branch: provenance.branch,
    commit: provenance.commit,
    path: provenance.files["projection.js"].path,
    sha256: PROJECTION_SHA256,
    gitBlob: provenance.files["projection.js"].gitBlob,
  },
  publishedSchemaVersion: SCHEMA_VERSION,
  projectionSchema: PROJECTION_SCHEMA,
  projectionId: PROJECTION_ID,
  sourceIds: SOURCE_IDS,
  publicInput: PUBLIC_SNAPSHOT_URL,
  reason:
    "Maintained projection bytes are the pinned S12 module. This branch tip does not carry that file under public/labs. Live reads use one GET of the public snapshot. Caller-supplied documents stay labelled separately and are not live captures.",
});

function sha256File(name) {
  const bytes = readFileSync(join(vendorDir, name));
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertProjectionProvenance() {
  const mismatches = [];
  for (const [name, pinned] of Object.entries(provenance.files)) {
    const actual = sha256File(name);
    if (actual !== pinned.sha256) mismatches.push({ name, actual, expected: pinned.sha256 });
  }
  if (mismatches.length > 0) {
    throw new MonitorError("vendored observatory bytes do not match PROVENANCE.json", {
      code: "provenance_mismatch",
    });
  }
  return { ok: true, commit: provenance.commit, projectionSha256: PROJECTION_SHA256 };
}

function clockText(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function captureFor(options) {
  if (options.capture === "live" || options.capture === "injected" || options.capture === "fixture" || options.capture === "seeded") {
    return options.capture;
  }
  return options.fetchImpl ? "injected" : "live";
}

function emptySums() {
  return {
    marketWideTraffic: null,
    combinedActivity: null,
    crossSourceSum: { refused: true, total: null },
  };
}

export async function readMaintainedProjection(options = {}) {
  assertProjectionProvenance();
  const capture = captureFor(options);
  const clock = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const fetched = await fetchObservatoryJson({
    url: PUBLIC_SNAPSHOT_URL,
    timeoutMs: options.timeoutMs || 20000,
    fetchImpl: options.fetchImpl,
    now: clock,
  });
  const fetchReceipt = {
    url: PUBLIC_SNAPSHOT_URL,
    httpStatus: fetched.receipt?.httpStatus ?? null,
    fetchedAt: fetched.receipt?.fetchedAt ?? null,
    failureKind: fetched.ok ? null : fetched.receipt?.failureKind || fetched.error?.kind || "source_unreachable",
    bytes: fetched.receipt?.bytes ?? null,
  };
  if (!fetched.ok) {
    return {
      integration: "maintained",
      status: "source_failure",
      capture,
      schemaVersion: PROJECTION_SCHEMA,
      publishedSchemaVersion: SCHEMA_VERSION,
      sourceIds: [...SOURCE_IDS],
      document: null,
      projection: null,
      publicSourceChanged: false,
      ...emptySums(),
      failureCode: fetchReceipt.failureKind || "source_unreachable",
      reason: fetched.error?.message || "observatory snapshot fetch failed",
      fetch: fetchReceipt,
      provenance: projectionIntegration.consumedFrom,
    };
  }
  const snapshot = parseSnapshot(fetched.body, {
    fetchedAt: fetched.receipt.fetchedAt,
    bridgeUrl: PUBLIC_SNAPSHOT_URL,
  });
  const observedAt = clock();
  const projection = projectSnapshot(snapshot, { observedAt, prior: options.prior || null });
  return {
    integration: "maintained",
    status: "maintained",
    capture,
    schemaVersion: PROJECTION_SCHEMA,
    projectionId: PROJECTION_ID,
    publishedSchemaVersion: SCHEMA_VERSION,
    sourceIds: [...SOURCE_IDS],
    document: projection,
    projection,
    publicSourceChanged: false,
    ...emptySums(),
    marketWideTraffic: projection.marketWideTraffic,
    combinedActivity: projection.combinedActivity,
    crossSourceSum: projection.crossSourceSum,
    observedAt,
    fetch: fetchReceipt,
    provenance: projectionIntegration.consumedFrom,
  };
}

export function projectionDocumentOf(reading) {
  if (!reading || typeof reading !== "object") return null;
  if (reading.projectionId === PROJECTION_ID && Array.isArray(reading.sources)) return reading;
  if (reading.projection && reading.projection.projectionId === PROJECTION_ID && Array.isArray(reading.projection.sources)) {
    return reading.projection;
  }
  if (reading.document && reading.document.projectionId === PROJECTION_ID && Array.isArray(reading.document.sources)) {
    return reading.document;
  }
  return null;
}

export function seedMeaningfulMutation(liveDocument, { sourceId, key, now } = {}) {
  const projection = projectionDocumentOf(liveDocument);
  if (!projection) {
    throw new MonitorError("seed input is not a maintained projection", { code: "seed_not_projection" });
  }
  if (!SOURCE_IDS.includes(sourceId)) {
    throw new MonitorError("seed source is not one of the maintained sources", { code: "seed_source" });
  }
  const slot = projection.sources.find((entry) => entry.sourceId === sourceId);
  const metric = slot && slot.metrics.find((entry) => entry.key === key);
  if (!metric || metric.state !== "ok" || metric.value == null || typeof metric.value !== "number") {
    throw new MonitorError("seed key is not a numeric maintained metric on that source", { code: "seed_key" });
  }
  const stamped = clockText(now) || new Date().toISOString();
  const before = metric.value;
  const after = before + 1;
  const observation = {
    sourceId,
    availability: "ok",
    fetchedAt: stamped,
    providerTimestamp: stamped,
    providerTimestampState: "ok",
    metrics: slot.metrics.map((entry) => (entry.key === key ? { ...entry, value: after, state: "ok" } : { ...entry })),
  };
  const applied = applySourceUpdate(projection, observation, { observedAt: stamped });
  if (applied.valueChanged !== true || applied.refused === true) {
    throw new MonitorError("seeded mutation was not accepted as a value change", { code: "seed_not_applied" });
  }
  return {
    integration: "maintained",
    status: "seeded",
    capture: "seeded",
    schemaVersion: PROJECTION_SCHEMA,
    projectionId: PROJECTION_ID,
    projection: applied.projection,
    document: applied.projection,
    publicSourceChanged: false,
    ...emptySums(),
    mutation: {
      seeded: true,
      sourceId,
      key,
      before,
      after,
      publicSourceChanged: false,
      summedWithPrior: false,
    },
  };
}

export function rejectSumClaim(document) {
  return rejectSeededFailure(document);
}

export function normalizeCallerSuppliedSnapshot(document) {
  if (document == null) {
    return {
      integration: "caller-supplied",
      status: "missing",
      capture: "caller-supplied",
      schemaVersion: SCHEMA_VERSION,
      document: null,
      snapshot: null,
      reason: "No caller-supplied document was provided. This path does not fetch the public snapshot and does not invent a row.",
    };
  }
  const capture = document.capture === "fixture" ? "fixture" : "caller-supplied";
  return {
    integration: "caller-supplied",
    status: "caller-supplied",
    capture,
    schemaVersion: SCHEMA_VERSION,
    snapshot: parseSnapshot(document, { fetchedAt: null }),
  };
}
