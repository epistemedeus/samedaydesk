import { isPlainObject, presentValue } from "./json.mjs";
import {
  BAZAAR_INDEX_FIELDS,
  DEFAULT_REQUIREMENTS,
  MERCHANT_PIN,
  PR54_RULES,
  SIGNED_AUTHORITY,
} from "./rules.mjs";
import { UNSIGNED_HINT_NOT_AUTHORITY } from "./failures.mjs";

function hintDrift(present, value) {
  if (!present) return "missing_hint";
  if (!isPlainObject(value)) return "mismatch";
  return "none";
}

function payloadDrift(present, value) {
  if (!present) return "unknown";
  if (!isPlainObject(value)) return "mismatch";
  return "none";
}

/**
 * Presence-only diagnostics for an Exact EVM v2 payment payload.
 * Never retries payment. Never declines verify/settle for hint mismatch.
 */
export function diagnosePaymentPayload(paymentPayload, options = {}) {
  const payloadObj = isPlainObject(paymentPayload) ? paymentPayload : {};
  const payloadPresent = presentValue(payloadObj, "payload");
  const resourcePresent = presentValue(payloadObj, "resource");
  const extensions = isPlainObject(payloadObj.extensions) ? payloadObj.extensions : null;
  const bazaarPresent = Boolean(extensions && presentValue(extensions, "bazaar"));
  const requirementsSiblingPresent =
    presentValue(payloadObj, "paymentRequirements") ||
    (options.siblingPaymentRequirements !== undefined &&
      options.siblingPaymentRequirements !== null);

  const diagnostics = [
    {
      field: "payload",
      present: payloadPresent,
      signed: true,
      drift: payloadDrift(payloadPresent, payloadObj.payload),
    },
    {
      field: "resource",
      present: resourcePresent,
      signed: false,
      drift: hintDrift(resourcePresent, payloadObj.resource),
    },
    {
      field: "extensions.bazaar",
      present: bazaarPresent,
      signed: false,
      drift: hintDrift(bazaarPresent, extensions ? extensions.bazaar : undefined),
    },
    {
      field: "other",
      present: requirementsSiblingPresent,
      signed: false,
      drift: "none",
    },
  ];

  return {
    diagnostics,
    paymentRetried: false,
    declinedPayment: false,
    bazaarIndexes: BAZAAR_INDEX_FIELDS,
    signedAuthority: SIGNED_AUTHORITY,
    merchantPin: MERCHANT_PIN,
    rules: PR54_RULES,
    requirements: options.requirements ?? DEFAULT_REQUIREMENTS,
  };
}

export function assertHonestDiagnostics(diagnostics) {
  for (const row of diagnostics) {
    const shouldBeSigned = row.field === "payload";
    if (row.signed !== shouldBeSigned) {
      return {
        ok: false,
        rejected: true,
        failure: UNSIGNED_HINT_NOT_AUTHORITY,
        offender: row,
      };
    }
  }
  return { ok: true, rejected: false, diagnostics };
}

export function markFieldSigned(field, signed) {
  if (field !== "payload" && signed) {
    return { ok: false, rejected: true, failure: UNSIGNED_HINT_NOT_AUTHORITY };
  }
  if (field === "payload" && signed === false) {
    return { ok: false, rejected: true, failure: UNSIGNED_HINT_NOT_AUTHORITY };
  }
  return { ok: true, field, signed };
}
