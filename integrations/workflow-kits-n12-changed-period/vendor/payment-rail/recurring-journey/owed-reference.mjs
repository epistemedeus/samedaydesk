/**
 * Consume-only reader for Agent Money owed references.
 *
 * Source pin: epistemedeus/pilot@527f69a8,
 * tools/ops/agent-money/walletless-earned-claim.contract.mjs (OWED_REFERENCE_KEYS,
 * OWED_REFERENCE_V2_KEYS and the published v2 recompute rule, lines 620 to 636).
 *
 * This module only reads and checks a reference that Agent Money produced, and
 * binds it to a recurring journey by its Agent Entry correlationId. It creates
 * no obligation, moves no money, signs nothing and keeps no ledger. Only
 * synthetic references are accepted.
 *
 * v2 digest rule: sha256 hex, no prefix, of
 * JSON.stringify({schema, obligationId, taskRef, integrity, state}) with the
 * keys in exactly that insertion order. It is NOT key-sorted, so do not use
 * request-contract.mjs canonicalJson or jsonBodySha256 here: those sort keys
 * (and jsonBodySha256 adds a sha256: prefix) and give a different digest.
 */
import { createHash } from "node:crypto";

import { CORRELATION_ID_RE } from "./pins.mjs";

export const OWED_REFERENCE_V1_SCHEMA = "pilot.agent-money.owed-reference.v1";
export const OWED_REFERENCE_V2_SCHEMA = "pilot.agent-money.owed-reference.v2";
export const OWED_REFERENCE_RESULT_SCHEMA = "useful-commerce.owed-reference-result.v1";

export const OWED_REFERENCE_V1_KEYS = Object.freeze([
  "schema",
  "synthetic",
  "obligationId",
  "taskRef",
  "integrity",
  "state",
]);
export const OWED_REFERENCE_V2_KEYS = Object.freeze([...OWED_REFERENCE_V1_KEYS, "referenceDigest"]);

export const OWED_REFERENCE_SOURCE = Object.freeze({
  repo: "epistemedeus/pilot",
  sha: "527f69a8",
  path: "tools/ops/agent-money/walletless-earned-claim.contract.mjs",
  lines: "620-636",
});

/**
 * Codes introduced by this module. All are non-retryable: the same reference
 * will be refused again. Recovery is to present a corrected reference.
 * None joins the frozen period RETRYABLE set or CONTINUITY_RETRYABLE.
 */
export const OWED_REFERENCE_CODES = Object.freeze([
  "owed_reference_invalid",
  "owed_reference_schema_unknown",
  "owed_reference_keys_mismatch",
  "owed_reference_not_synthetic",
  "owed_reference_field_invalid",
  "integrity_mismatch",
  "owed_reference_unbound",
]);

const HEX64 = /^[0-9a-f]{64}$/;

function refuse(code, message, extra = {}) {
  return {
    schemaVersion: OWED_REFERENCE_RESULT_SCHEMA,
    ok: false,
    outcome: "exception",
    reason: code,
    code,
    message,
    exception: { code, message },
    retry: { retryable: false },
    ...extra,
  };
}

/** v2 digest over the five digested fields in fixed insertion order. */
export function owedReferenceV2Digest(ref) {
  const { schema, obligationId, taskRef, integrity, state } = ref ?? {};
  const body = JSON.stringify({ schema, obligationId, taskRef, integrity, state });
  return createHash("sha256").update(body).digest("hex");
}

function sameKeySet(actual, expected) {
  if (actual.length !== expected.length) return false;
  const want = new Set(expected);
  return actual.every((key) => want.has(key));
}

/**
 * Accepts v1 (exactly the six v1 keys; referenceDigest is reported as null) or
 * v2 (the six keys plus referenceDigest, which must match the recompute).
 * Refuses other schemas, missing or extra keys, non-synthetic references and
 * malformed fields.
 */
export function consumeOwedReference(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
    return refuse("owed_reference_invalid", "owed reference must be an object");
  }
  const keys = Object.keys(ref);
  let expectedKeys;
  if (ref.schema === OWED_REFERENCE_V1_SCHEMA) expectedKeys = OWED_REFERENCE_V1_KEYS;
  else if (ref.schema === OWED_REFERENCE_V2_SCHEMA) expectedKeys = OWED_REFERENCE_V2_KEYS;
  else {
    return refuse("owed_reference_schema_unknown", "owed reference schema must be owed-reference v1 or v2", {
      schema: typeof ref.schema === "string" ? ref.schema : null,
    });
  }
  if (!sameKeySet(keys, expectedKeys)) {
    const want = new Set(expectedKeys);
    const have = new Set(keys);
    return refuse("owed_reference_keys_mismatch", `owed reference keys must be exactly: ${expectedKeys.join(", ")}`, {
      extraKeys: keys.filter((key) => !want.has(key)),
      missingKeys: expectedKeys.filter((key) => !have.has(key)),
    });
  }
  if (ref.synthetic !== true) {
    return refuse("owed_reference_not_synthetic", "only synthetic owed references are consumed here; no live payment or signing");
  }
  if (typeof ref.obligationId !== "string" || !ref.obligationId) {
    return refuse("owed_reference_field_invalid", "obligationId must be a non-empty string", { field: "obligationId" });
  }
  if (typeof ref.taskRef !== "string" || !CORRELATION_ID_RE.test(ref.taskRef)) {
    return refuse("owed_reference_field_invalid", "taskRef must be an ae:corr:v1 correlationId", { field: "taskRef" });
  }
  if (typeof ref.integrity !== "string" || !HEX64.test(ref.integrity)) {
    return refuse("owed_reference_field_invalid", "integrity must be 64 lowercase hex characters", { field: "integrity" });
  }
  if (typeof ref.state !== "string" || !ref.state) {
    return refuse("owed_reference_field_invalid", "state must be a non-empty string", { field: "state" });
  }

  let referenceDigest = null;
  if (ref.schema === OWED_REFERENCE_V2_SCHEMA) {
    const recomputed = owedReferenceV2Digest(ref);
    if (ref.referenceDigest !== recomputed) {
      return refuse("integrity_mismatch", "referenceDigest does not match the v2 recompute", {
        expectedDigest: recomputed,
        actualDigest: typeof ref.referenceDigest === "string" ? ref.referenceDigest : null,
      });
    }
    referenceDigest = recomputed;
  }

  return {
    schemaVersion: OWED_REFERENCE_RESULT_SCHEMA,
    ok: true,
    outcome: "consumed",
    reason: "consumed",
    code: null,
    message: "owed reference consumed; no payment authority",
    exception: null,
    retry: { retryable: false },
    version: ref.schema === OWED_REFERENCE_V2_SCHEMA ? 2 : 1,
    reference: {
      schema: ref.schema,
      obligationId: ref.obligationId,
      taskRef: ref.taskRef,
      integrity: ref.integrity,
      state: ref.state,
      referenceDigest,
    },
  };
}

/**
 * Binds a consumed reference to a journey. taskRef must equal the journey's
 * Agent Entry correlationId. Returns the binding on success, or a typed refusal.
 */
export function bindOwedReferenceToJourney(ref, { correlationId = null } = {}) {
  const consumed = consumeOwedReference(ref);
  if (!consumed.ok) return consumed;
  if (typeof correlationId !== "string" || consumed.reference.taskRef !== correlationId) {
    return refuse("owed_reference_unbound", "owed reference taskRef does not match the journey correlationId", {
      taskRef: consumed.reference.taskRef,
      correlationId: typeof correlationId === "string" ? correlationId : null,
    });
  }
  const { obligationId, taskRef, integrity, referenceDigest } = consumed.reference;
  return {
    schemaVersion: OWED_REFERENCE_RESULT_SCHEMA,
    ok: true,
    outcome: "bound",
    reason: "bound",
    code: null,
    message: "owed reference bound to the journey correlationId; no payment authority",
    exception: null,
    retry: { retryable: false },
    binding: { obligationId, taskRef, integrity, referenceDigest },
  };
}
