import { canonicalJson } from "../buyer/request-contract.mjs";
import {
  JOB_CONTRACT_SCHEMA,
  buildJobContract,
  evidenceDigest,
  omitPaths,
} from "./job-contract.mjs";

export const ACCEPTANCE_ARTIFACT_SCHEMA = "job-acceptance-artifact.v1";

function fail(message) {
  throw new Error(message);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asContract(value) {
  if (record(value)?.schemaVersion === JOB_CONTRACT_SCHEMA && value.requestDigest) {
    return value;
  }
  return buildJobContract(value);
}

function equalJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

export function createEffectProjection() {
  const byAuthoritativeKey = new Map();
  return {
    kind: "projection",
    get(authoritativeKey) {
      return byAuthoritativeKey.get(authoritativeKey) ?? null;
    },
    remember(authoritativeKey, effect) {
      const existing = byAuthoritativeKey.get(authoritativeKey);
      if (existing?.committed) {
        return { applied: false, effect: existing };
      }
      const projected = {
        kind: "projection",
        authoritativeKey,
        decision: effect.decision,
        reasons: effect.reasons,
        result: effect.result,
        committed: true,
      };
      byAuthoritativeKey.set(authoritativeKey, projected);
      return { applied: true, effect: projected };
    },
  };
}

export function createEffectStore() {
  return createEffectProjection();
}

function deliveryRecord(value) {
  const delivery = record(value);
  if (!delivery) fail("delivery is required");
  return delivery;
}

function listedEvidence(delivery) {
  const items = Array.isArray(delivery.evidence) ? delivery.evidence : [];
  const listed = new Map();
  for (const item of items) {
    const evidence = record(item);
    if (!evidence?.name) continue;
    const digest = evidence.digest || (evidence.value !== undefined ? evidenceDigest(evidence.value) : null);
    if (digest) listed.set(String(evidence.name), digest);
  }
  return listed;
}

function evidenceReasons(contract, delivery) {
  const reasons = [];
  const listed = listedEvidence(delivery);
  for (const required of contract.acceptance.requiredEvidence) {
    const actual = listed.get(required.name);
    if (!actual) {
      reasons.push(`missing required evidence: ${required.name}`);
      continue;
    }
    if (actual !== required.digest) {
      reasons.push(`wrong required evidence: ${required.name}`);
    }
  }
  return reasons;
}

function usefulResultPresent(delivery) {
  return delivery.result !== undefined && delivery.result !== null;
}

function chargeOrTypedOnly(delivery, evidenceOk, resultMatches) {
  const hasCharge = record(delivery.charge) !== null;
  const hasTypedOutput = delivery.typedOutput !== undefined && delivery.typedOutput !== null;
  if (resultMatches && evidenceOk) return false;
  return hasCharge || hasTypedOutput;
}

function snapshotDelivery(delivery) {
  return {
    requestDigest: delivery.requestDigest ?? null,
    committed: delivery.committed === true,
    result: delivery.result === undefined ? null : delivery.result,
    evidence: Array.isArray(delivery.evidence) ? delivery.evidence : [],
    ...(delivery.charge ? { charge: delivery.charge } : {}),
    ...(delivery.typedOutput !== undefined ? { typedOutput: delivery.typedOutput } : {}),
    ...(delivery.input !== undefined ? { input: delivery.input } : {}),
  };
}

function artifactFrom({
  contract,
  delivery,
  decision,
  reasons,
  result,
  recovered,
  secondEffect,
  committed,
  createdAt,
}) {
  return {
    schemaVersion: ACCEPTANCE_ARTIFACT_SCHEMA,
    synthetic: contract.synthetic === true,
    source: contract.source,
    task: contract.task,
    target: contract.target,
    requestDigest: contract.requestDigest,
    quote: contract.quote,
    expectedResult: contract.acceptance.expectedResult,
    decision,
    reasons,
    result,
    evidence: Array.isArray(delivery?.evidence) ? delivery.evidence : [],
    committed,
    recovered,
    secondEffect,
    createdAt,
    recordKind: "projection",
    authoritativeKey: contract.requestDigest,
    delivery: snapshotDelivery(delivery || { committed, result, evidence: [] }),
  };
}

export function evaluateAcceptance({
  contract,
  delivery,
  priorReceipt = null,
  effectStore = null,
  now = Date.now(),
} = {}) {
  const built = asContract(contract);
  const current = deliveryRecord(delivery);
  const createdAt = new Date(now).toISOString();

  if (current.requestDigest && current.requestDigest !== built.requestDigest) {
    return artifactFrom({
      contract: built,
      delivery: current,
      decision: "reject",
      reasons: ["delivery request digest does not match the job contract"],
      result: null,
      recovered: false,
      secondEffect: false,
      committed: false,
      createdAt,
    });
  }

  const prior = record(priorReceipt);
  const stored = effectStore?.get(built.requestDigest) || (prior?.committed === true && prior.requestDigest === built.requestDigest ? prior : null);
  if (stored?.committed) {
    return artifactFrom({
      contract: built,
      delivery: current,
      decision: stored.decision || "accept",
      reasons: ["recovered original result after first effect; no second effect"],
      result: stored.result,
      recovered: true,
      secondEffect: false,
      committed: true,
      createdAt,
    });
  }

  if (current.committed !== true) {
    return artifactFrom({
      contract: built,
      delivery: current,
      decision: "reject",
      reasons: ["first request is uncommitted; no result was fabricated"],
      result: null,
      recovered: false,
      secondEffect: false,
      committed: false,
      createdAt,
    });
  }

  const reasons = [];
  if (current.requestDigest && current.requestDigest !== built.requestDigest) {
    reasons.push("delivery request digest does not match the job contract");
  }

  const evidenceProblems = evidenceReasons(built, current);
  reasons.push(...evidenceProblems);
  const evidenceOk = evidenceProblems.length === 0;

  const comparedResult = omitPaths(current.result, built.acceptance.immaterialInputPaths);
  const expected = omitPaths(built.acceptance.expectedResult, built.acceptance.immaterialInputPaths);
  const resultMatches = usefulResultPresent(current) && equalJson(comparedResult, expected);
  if (!usefulResultPresent(current)) {
    reasons.push("useful result is missing");
  } else if (!resultMatches) {
    reasons.push("result does not match the expected result");
  }

  if (chargeOrTypedOnly(current, evidenceOk, resultMatches)) {
    reasons.push("typed output or charge alone never passes acceptance");
  }

  if (current.input !== undefined && built.acceptance.immaterialInputPaths.length) {
    void omitPaths(current.input, built.acceptance.immaterialInputPaths);
  }

  const uniqueReasons = [...new Set(reasons)];
  const decision = uniqueReasons.length === 0 ? "accept" : "reject";
  const acceptedResult = decision === "accept" ? current.result : null;

  if (effectStore) {
    effectStore.remember(built.requestDigest, {
      decision,
      reasons: uniqueReasons,
      result: acceptedResult,
      committed: true,
    });
  }

  return artifactFrom({
    contract: built,
    delivery: current,
    decision,
    reasons: uniqueReasons,
    result: acceptedResult,
    recovered: false,
    secondEffect: false,
    committed: true,
    createdAt,
  });
}

export function rerunAcceptance({ contract, artifact, delivery = null, effectStore = null, now = Date.now() } = {}) {
  const prior = record(artifact);
  if (!prior || prior.schemaVersion !== ACCEPTANCE_ARTIFACT_SCHEMA) {
    fail("rerun requires a job acceptance artifact");
  }
  return evaluateAcceptance({
    contract,
    delivery: delivery || prior.delivery,
    priorReceipt: prior,
    effectStore,
    now,
  });
}

export function encodeArtifact(artifact) {
  return `${canonicalJson(artifact)}\n`;
}
