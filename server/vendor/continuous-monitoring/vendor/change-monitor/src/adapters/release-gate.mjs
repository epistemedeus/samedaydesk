import { RECEIPT_SCHEMA } from "../runtime/release-gate-pin.mjs";

import { isPlain, observation } from "./shape.mjs";

export const MATERIAL_FIELDS = Object.freeze([
  "qualification",
  "subject",
  "version",
  "releaseId",
  "verdict",
  "accepted",
  "code",
  "launched",
  "ownerPayment",
  "substitutesForRouteLockRelease",
  "originProof",
  "summary",
  "surfaces",
]);

export const NON_SEMANTIC = Object.freeze([
  {
    field: "generatedAt",
    reason: "Checklist generation clock. Task relevance is verdict, surfaces, and origin proof status.",
  },
  {
    field: "reason",
    reason: "Prose. The verdict and surface acceptance are the task fields.",
  },
  {
    field: "surfaces[].reason",
    reason: "Prose. Surface id, acceptance, and state are the task fields.",
  },
  {
    field: "originProof.awaiting",
    reason: "Prose. originProof.status and liveReadback are the task fields.",
  },
]);

const VERDICTS = new Set(["held", "gated", "accepted", "revoked"]);
const SUMMARY_KEYS = ["pass", "hold", "gate", "wait", "unavailable_ok"];

function summaryOf(summary) {
  const out = {};
  for (const key of SUMMARY_KEYS) {
    const value = summary?.[key];
    out[key] = Number.isInteger(value) ? value : 0;
  }
  return out;
}

function surfacesOf(surfaces) {
  return surfaces
    .map((row) => ({
      id: row.id,
      layer: row.layer ?? null,
      kind: row.kind ?? null,
      state: row.state ?? null,
      acceptance: row.acceptance ?? null,
      cacheOf: row.cacheOf ?? null,
      required: row.required === true,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export const releaseGateAdapter = {
  id: "release-gate",
  schemaId: RECEIPT_SCHEMA,
  MATERIAL_FIELDS,
  NON_SEMANTIC,
  normalize(subscription, document, ctx = {}) {
    const shared = {
      adapterId: "release-gate",
      schemaId: RECEIPT_SCHEMA,
      correctsEvidenceId: ctx.correctsEvidenceId ?? null,
    };
    if (!isPlain(document)) {
      return observation(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "document_not_object" });
    }
    if (document.schema !== RECEIPT_SCHEMA) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "schema_mismatch",
        nonSemantic: { schema: document.schema ?? null },
      });
    }
    const version = document.version ?? "unversioned";
    const derivedScope = `release-gate:${document.subject}@${version}`;
    if (derivedScope !== subscription.source.scope) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "scope_mismatch",
        sourceVersion: document.version ?? null,
        nonSemantic: { derivedScope },
      });
    }
    if (!VERDICTS.has(document.verdict) || typeof document.accepted !== "boolean" || !Array.isArray(document.surfaces)) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "receipt_unreadable",
        sourceVersion: document.version ?? null,
        observedAt: typeof document.generatedAt === "string" ? document.generatedAt : null,
      });
    }
    if (document.surfaces.some((row) => !isPlain(row) || typeof row.id !== "string")) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "surfaces_unreadable",
        sourceVersion: document.version ?? null,
      });
    }
    const coverage = { surfaceCount: document.surfaces.length };
    return observation(subscription, {
      ...shared,
      evidenceClass: "comparable",
      sourceVersion: document.version ?? null,
      observedAt: typeof document.generatedAt === "string" ? document.generatedAt : null,
      coverage,
      nonSemantic: {
        generatedAt: document.generatedAt ?? null,
        reason: document.reason ?? null,
      },
      material: {
        qualification: document.qualification ?? null,
        subject: document.subject,
        version: document.version ?? null,
        releaseId: document.releaseId ?? null,
        verdict: document.verdict,
        accepted: document.accepted,
        code: document.code ?? null,
        launched: document.launched === true,
        ownerPayment: document.ownerPayment === true,
        substitutesForRouteLockRelease: document.substitutesForRouteLockRelease === true,
        originProof: {
          status: document.originProof?.status ?? null,
          liveReadback: document.originProof?.liveReadback === true,
        },
        summary: summaryOf(document.summary),
        surfaces: surfacesOf(document.surfaces),
      },
    });
  },
};
