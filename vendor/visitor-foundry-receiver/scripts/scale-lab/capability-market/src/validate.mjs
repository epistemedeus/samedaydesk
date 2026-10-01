import {
  FORBIDDEN_FIELDS,
  LAYERS,
  MATCH_REFUSAL,
  PRICE_SOURCE,
  ROUTE_KIND,
  SELLER_CLASS,
} from "./constants.mjs";
import { safeCapabilityHref } from "./safety.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasForbiddenField(record) {
  return FORBIDDEN_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/**
 * Validate one capability advertisement. Returns { ok, errors, refusals }.
 * Does not fetch any URL.
 */
export function validateCapability(raw, { nowMs = Date.now() } = {}) {
  const errors = [];
  const refusals = [];

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      errors: ["capability must be an object"],
      refusals: [MATCH_REFUSAL.MALFORMED_CAPABILITY],
    };
  }

  if (hasForbiddenField(raw)) {
    errors.push("capability declares forbidden ranking, custody, review, or broadcast fields");
    refusals.push(MATCH_REFUSAL.DECEPTIVE_CAPABILITY);
  }

  for (const key of ["id", "title", "summary", "layer", "outcomes"]) {
    if (raw[key] == null || raw[key] === "") errors.push(`missing ${key}`);
  }

  if (raw.layer && !Object.values(LAYERS).includes(raw.layer)) {
    errors.push(`unknown layer ${raw.layer}`);
  }

  if (!Array.isArray(raw.outcomes) || raw.outcomes.length === 0) {
    errors.push("outcomes must be a non-empty string array");
  } else if (!raw.outcomes.every((o) => typeof o === "string" && o.trim())) {
    errors.push("each outcome must be a non-empty string");
  }

  if (!isPlainObject(raw.inputRequirements)) errors.push("missing inputRequirements object");
  if (!isPlainObject(raw.outputRequirements)) errors.push("missing outputRequirements object");

  const price = raw.price;
  if (!isPlainObject(price)) {
    errors.push("missing price object");
  } else {
    for (const key of ["amount", "currency", "source", "observedAt", "freshnessMaxAgeSec"]) {
      if (price[key] == null || price[key] === "") errors.push(`missing price.${key}`);
    }
    if (price.source && !Object.values(PRICE_SOURCE).includes(price.source)) {
      // Unknown source is allowed only when explicitly labelled fixture/demo.
      if (raw.seller?.class !== SELLER_CLASS.FIXTURE_DEMO && raw.demo !== true) {
        errors.push(`undeclared price source ${price.source}`);
        refusals.push(MATCH_REFUSAL.DECEPTIVE_CAPABILITY);
      }
    }
    if (typeof price.freshnessMaxAgeSec === "number" && price.observedAt) {
      const observed = Date.parse(price.observedAt);
      if (Number.isNaN(observed)) {
        errors.push("price.observedAt is not a valid timestamp");
      } else if (observed + price.freshnessMaxAgeSec * 1000 < nowMs) {
        refusals.push(MATCH_REFUSAL.STALE_PRICE);
      }
    }
  }

  const seller = raw.seller;
  if (!isPlainObject(seller)) {
    errors.push("missing seller object");
  } else {
    if (!Object.values(SELLER_CLASS).includes(seller.class)) {
      errors.push("seller.class must be operator or fixture_demo");
    }
    if (typeof seller.label !== "string" || !seller.label.trim()) {
      errors.push("seller.label required");
    }
    if (seller.class === SELLER_CLASS.FIXTURE_DEMO) {
      if (raw.demo !== true) {
        errors.push("fixture_demo seller must set demo:true");
        refusals.push(MATCH_REFUSAL.DECEPTIVE_CAPABILITY);
      }
      if (!/fixture|demo|fictional/i.test(seller.label)) {
        errors.push("fixture seller label must say fixture/demo/fictional");
        refusals.push(MATCH_REFUSAL.DECEPTIVE_CAPABILITY);
      }
    }
    if (seller.class === SELLER_CLASS.OPERATOR && raw.demo === true) {
      errors.push("operator seller cannot be marked demo");
      refusals.push(MATCH_REFUSAL.DECEPTIVE_CAPABILITY);
    }
  }

  const route = raw.executionRoute;
  if (!isPlainObject(route)) {
    errors.push("missing executionRoute");
  } else {
    if (!Object.values(ROUTE_KIND).includes(route.kind)) {
      errors.push(`unknown executionRoute.kind ${route.kind}`);
    }
    const href = safeCapabilityHref(route.href);
    if (!href) {
      errors.push("executionRoute.href failed safety check");
      refusals.push(MATCH_REFUSAL.UNSAFE_URL);
    }
  }

  const completion = raw.completionLink;
  if (!isPlainObject(completion)) {
    errors.push("missing completionLink");
  } else {
    const href = safeCapabilityHref(completion.href);
    if (!href) {
      errors.push("completionLink.href failed safety check");
      refusals.push(MATCH_REFUSAL.UNSAFE_URL);
    }
  }

  // Deceptive: advertise reviews/rank or claim live while fixture.
  if (raw.claims?.independentCustomers === true && (raw.demo || seller?.class === SELLER_CLASS.FIXTURE_DEMO)) {
    errors.push("fixture capability cannot claim independent customers");
    refusals.push(MATCH_REFUSAL.DECEPTIVE_CAPABILITY);
  }

  if (errors.length && !refusals.includes(MATCH_REFUSAL.MALFORMED_CAPABILITY) && !refusals.includes(MATCH_REFUSAL.DECEPTIVE_CAPABILITY)) {
    refusals.push(MATCH_REFUSAL.MALFORMED_CAPABILITY);
  }

  return {
    ok: errors.length === 0 && !refusals.includes(MATCH_REFUSAL.DECEPTIVE_CAPABILITY) && !refusals.includes(MATCH_REFUSAL.MALFORMED_CAPABILITY),
    errors,
    refusals: [...new Set(refusals)],
    stale: refusals.includes(MATCH_REFUSAL.STALE_PRICE),
  };
}

/**
 * Check whether supplied inputs satisfy a capability's declared inputRequirements.
 * inputRequirements.shape: { required: string[], properties: { [k]: { type } } }
 */
export function inputsCompatible(capability, inputs) {
  if (!isPlainObject(inputs)) {
    return { ok: false, missing: ["(inputs object)"], incompatible: [] };
  }
  const req = capability.inputRequirements || {};
  const required = Array.isArray(req.required) ? req.required : [];
  const properties = isPlainObject(req.properties) ? req.properties : {};
  const missing = [];
  const incompatible = [];

  for (const key of required) {
    if (inputs[key] == null || inputs[key] === "") missing.push(key);
  }
  for (const [key, spec] of Object.entries(properties)) {
    if (inputs[key] == null || inputs[key] === "") continue;
    if (spec?.type === "string" && typeof inputs[key] !== "string") incompatible.push(key);
    if (spec?.type === "number" && typeof inputs[key] !== "number") incompatible.push(key);
    if (spec?.type === "array" && !Array.isArray(inputs[key])) incompatible.push(key);
    if (spec?.enum && !spec.enum.includes(inputs[key])) incompatible.push(key);
    if (spec?.maxItems && Array.isArray(inputs[key]) && inputs[key].length > spec.maxItems) {
      incompatible.push(key);
    }
  }

  return {
    ok: missing.length === 0 && incompatible.length === 0,
    missing,
    incompatible,
  };
}
