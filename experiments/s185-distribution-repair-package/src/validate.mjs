import { FORBIDDEN_FIELDS as RECORD04_FORBIDDEN } from "../vendor/record04/src/constants.mjs";
import { FORBIDDEN_FIELDS as NL06_FORBIDDEN } from "../vendor/nl06/src/constants.mjs";
import {
  FORBIDDEN_CLAIM_FIELDS,
  FORBIDDEN_INTENT_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
} from "../vendor/dist08/src/constants.mjs";
import { STATUS } from "./constants.mjs";
import { isPlainObject } from "./identity.mjs";

const FORBIDDEN = new Set([
  ...RECORD04_FORBIDDEN,
  ...NL06_FORBIDDEN,
  ...FORBIDDEN_CLAIM_FIELDS,
  ...FORBIDDEN_INTENT_FIELDS,
  ...FORBIDDEN_SECRET_FIELDS,
]);

export function productError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

export function rejectForbidden(obj, path = "") {
  if (!isPlainObject(obj) && !Array.isArray(obj)) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => rejectForbidden(item, `${path}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN.has(key)) {
      throw productError("forbidden_claim", `Forbidden field: ${key}`, {
        path: here,
        field: key,
      });
    }
    rejectForbidden(obj[key], here);
  }
}

export function claims() {
  return {
    conversionFromClick: false,
    revenueFromListPrice: false,
    buyerIntentFromActivation: false,
    productionAcquisition: false,
    grexalUniversalAdapter: false,
    causalProofOfLostCustomers: false,
    fixtureDerivedJoin: true,
    denies: [
      "invented_revenue",
      "live_traffic",
      "seo_ranking",
      "lost_customers_proof",
      "production_acquisition",
      "grexal_universal_adapter",
    ],
  };
}

export function freeVsPriced() {
  return {
    discovery: "free",
    pricedExecution: "not_invoked",
    thisPackage: "free_offline_diagnosis",
    paidInvokeExecuted: false,
    listPriceIsCharge: false,
  };
}

export function malformedResult(message, details, generatedAt) {
  return {
    schema: "pilot.s185.distribution_repair_result.v1",
    status: STATUS.MALFORMED,
    ok: false,
    generatedAt,
    error: {
      code: details?.code || "invalid_input",
      message,
      details: details || null,
    },
    matching: {
      compatible: false,
      joinedCount: 0,
      unjoinedCount: 0,
      keys: [],
      reason: "malformed_input",
    },
    diagnosis: null,
    feed: null,
    repair: {
      recommendations: [],
      beforeAfter: null,
      nextChecks: ["supply_valid_identity_and_route_pair"],
      ownerGuidance: true,
      causalProofOfLostCustomers: false,
    },
    gaps: [{ code: "malformed_input", message }],
    claims: claims(),
    freeVsPriced: freeVsPriced(),
    productionAcquisition: false,
  };
}
