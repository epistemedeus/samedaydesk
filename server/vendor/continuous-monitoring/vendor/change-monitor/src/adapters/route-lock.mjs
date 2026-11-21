import { isPlain, observation, sortedStrings } from "./shape.mjs";

export const DECISION_SCHEMA = "route-lock.decision.v1";

export const DIMENSIONS = Object.freeze([
  "discovery",
  "challenge_validity",
  "request_constructibility",
  "declared_output_contract",
  "payment_term_stability",
  "endpoint_availability",
]);

const DIMENSION_STATUS = new Set(["pass", "fail", "review", "not_applicable"]);
const DECISIONS = new Set(["lockable", "review", "skip"]);

export const MATERIAL_FIELDS = Object.freeze([
  "decision",
  "code",
  "findings",
  "dimensions",
  "terms",
  "evidence",
  "availability",
  "nextAction",
  "boundaryFlags",
]);

export const NON_SEMANTIC = Object.freeze([
  {
    field: "evaluatedAt",
    reason: "SOURCE-MATRIX: evaluatedAt is the Route Lock decision clock, not a capability field.",
  },
  {
    field: "evidence.observedAt",
    reason: "Observation clock. Missing observedAt is evidence class missing. Stale evidence is class stale. The task boolean is evidence.fresh.",
  },
  {
    field: "evidence.validityWindowMs",
    reason: "Window used to compute evidence.fresh. The capability fact is the fresh boolean plus the decision.",
  },
  {
    field: "reason",
    reason: "Prose derived from code. The task fields are decision, code, dimensions, and terms.",
  },
  {
    field: "boundary.statement",
    reason: "Constant explanatory prose. The boolean boundary flags are the task fields.",
  },
]);

function dimensionMaterial(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length !== DIMENSIONS.length) return null;
  const byId = new Map();
  for (const row of dimensions) {
    if (!isPlain(row) || !DIMENSIONS.includes(row.id) || !DIMENSION_STATUS.has(row.status)) return null;
    if (typeof row.code !== "string" || !Array.isArray(row.findings)) return null;
    if (row.findings.some((entry) => typeof entry !== "string")) return null;
    byId.set(row.id, {
      id: row.id,
      status: row.status,
      code: row.code,
      findings: [...row.findings].sort(),
    });
  }
  if (byId.size !== DIMENSIONS.length) return null;
  return DIMENSIONS.map((id) => byId.get(id));
}

export const routeLockAdapter = {
  id: "route-lock",
  schemaId: DECISION_SCHEMA,
  MATERIAL_FIELDS,
  NON_SEMANTIC,
  normalize(subscription, document, ctx = {}) {
    const shared = {
      adapterId: "route-lock",
      schemaId: DECISION_SCHEMA,
      sourceVersion: DECISION_SCHEMA,
      correctsEvidenceId: ctx.correctsEvidenceId ?? null,
      observedAt: typeof document?.evaluatedAt === "string" ? document.evaluatedAt : null,
    };
    if (!isPlain(document)) {
      return observation(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "document_not_object", observedAt: null });
    }
    if (document.schemaVersion !== DECISION_SCHEMA) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "schema_mismatch",
        nonSemantic: { schemaVersion: document.schemaVersion ?? null },
      });
    }
    const binding = document.evidence?.bindingDigest || document.identity?.bindingDigest || null;
    if (typeof binding !== "string" || !binding) {
      return observation(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "binding_missing" });
    }
    const derivedScope = `route-lock:decision:${binding}`;
    if (derivedScope !== subscription.source.scope) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "scope_mismatch",
        nonSemantic: { derivedScope },
      });
    }
    const evidence = document.evidence;
    if (!isPlain(evidence) || evidence.present !== true) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "missing",
        failureCode: "evidence_missing",
        coverage: { present: false, fresh: false },
        nonSemantic: { evaluatedAt: document.evaluatedAt ?? null, observedAt: evidence?.observedAt ?? null },
      });
    }
    if (evidence.fresh !== true) {
      return observation(subscription, {
        ...shared,
        evidenceClass: "stale",
        failureCode: "evidence_stale",
        coverage: { present: true, fresh: false },
        nonSemantic: { evaluatedAt: document.evaluatedAt ?? null, observedAt: evidence.observedAt ?? null },
      });
    }
    const dimensions = dimensionMaterial(document.dimensions);
    const findings = sortedStrings(document.findings);
    const matched = sortedStrings(document.terms?.matched);
    const drifted = sortedStrings(document.terms?.drifted);
    const unknown = sortedStrings(document.terms?.unknown);
    if (
      !DECISIONS.has(document.decision) ||
      typeof document.code !== "string" ||
      typeof document.nextAction !== "string" ||
      !dimensions ||
      !findings ||
      !matched ||
      !drifted ||
      !unknown
    ) {
      return observation(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "decision_unreadable" });
    }
    const coverage = { dimensionCount: dimensions.length, present: true, fresh: true };
    return observation(subscription, {
      ...shared,
      evidenceClass: "comparable",
      coverage,
      nonSemantic: {
        evaluatedAt: document.evaluatedAt ?? null,
        observedAt: evidence.observedAt ?? null,
        validityWindowMs: evidence.validityWindowMs ?? null,
        reason: document.reason ?? null,
      },
      material: {
        decision: document.decision,
        code: document.code,
        findings,
        dimensions,
        terms: { matched, drifted, unknown },
        evidence: {
          present: true,
          fresh: true,
          digest: evidence.digest ?? null,
          bindingDigest: binding,
        },
        availability: {
          consulted: document.availability?.consulted === true,
          status: Number.isInteger(document.availability?.status) ? document.availability.status : null,
        },
        nextAction: document.nextAction,
        boundaryFlags: {
          reservesFunds: document.boundary?.reservesFunds === true,
          paymentSent: document.boundary?.paymentSent === true,
          settlementAttempted: document.boundary?.settlementAttempted === true,
        },
      },
    });
  },
};
