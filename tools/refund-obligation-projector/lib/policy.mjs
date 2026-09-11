import {
  POLICY_SCHEMA,
  REFUND_CLAIMS,
  TESTED_BINDINGS,
} from "./contract.mjs";
import { refuse } from "./refuse.mjs";
import { isIntegerTermsVersion, isTermsVersionHash } from "./terms.mjs";

export function parsePolicy(document, terms = null) {
  if (document == null) return null;
  if (typeof document !== "object" || Array.isArray(document)) {
    refuse("invalid_refund_policy", "refund policy must be an object");
  }
  if (document.schema !== POLICY_SCHEMA) {
    refuse("invalid_refund_policy", `refund policy schema must be ${POLICY_SCHEMA}`);
  }
  if (typeof document.policyId !== "string" || document.policyId.length < 3) {
    refuse("invalid_refund_policy", "policyId is required");
  }
  if (document.termsVersion != null) {
    if (isIntegerTermsVersion(document.termsVersion)) {
      refuse(
        "integer_terms_version",
        "I01 content-hash termsVersion required; integer termsVersion is rejected",
      );
    }
    if (!isTermsVersionHash(document.termsVersion)) {
      refuse("invalid_terms_version", "termsVersion must be sha256: plus 64 lowercase hex");
    }
    if (typeof terms?.assertKind === "function") {
      const checked = terms.assertKind(document.termsVersion);
      if (!checked.ok) refuse(checked.code, checked.message);
    }
  }
  const defaultClaim = document.defaultClaim ?? "unknown";
  if (!REFUND_CLAIMS.includes(defaultClaim)) {
    refuse("invalid_refund_policy", `defaultClaim is not in the closed set: ${defaultClaim}`);
  }
  if (!Array.isArray(document.rules)) {
    refuse("invalid_refund_policy", "rules must be an array");
  }
  const rules = document.rules.map((rule, index) => parseRule(rule, index));
  return {
    schema: POLICY_SCHEMA,
    policyId: document.policyId,
    termsVersion: document.termsVersion ?? null,
    defaultClaim,
    rules,
    i01Pin: TESTED_BINDINGS.i01HashTerms.pin,
  };
}

function parseRule(rule, index) {
  if (!rule || typeof rule !== "object") {
    refuse("invalid_refund_policy", `rule ${index} must be an object`);
  }
  if (!REFUND_CLAIMS.includes(rule.claim)) {
    refuse("invalid_refund_policy", `rule ${index} claim is not in the closed set`);
  }
  if (rule.claim === "unknown") {
    refuse("invalid_refund_policy", `rule ${index} cannot set unknown; omit the rule instead`);
  }
  const match = rule.match;
  if (!match || typeof match !== "object" || Array.isArray(match)) {
    refuse("invalid_refund_policy", `rule ${index} match must be an object`);
  }
  const keys = Object.keys(match);
  if (keys.length === 0) {
    refuse("invalid_refund_policy", `rule ${index} match must name at least one exact field`);
  }
  const allowed = new Set(["operationId", "sourceKind", "delivery", "buyerClass"]);
  for (const key of keys) {
    if (!allowed.has(key)) {
      refuse("invalid_refund_policy", `rule ${index} match field ${key} is not allowed`);
    }
    if (typeof match[key] !== "string" || match[key].length === 0) {
      refuse("invalid_refund_policy", `rule ${index} match.${key} must be an exact string`);
    }
  }
  return { claim: rule.claim, match: { ...match } };
}

export function applyExplicitPolicy(policy, facts) {
  if (!policy) {
    return {
      refundClaim: "unknown",
      refundClaimSource: "no_policy",
      policyId: null,
    };
  }
  for (const rule of policy.rules) {
    if (exactMatch(rule.match, facts)) {
      return {
        refundClaim: rule.claim,
        refundClaimSource: "explicit_policy",
        policyId: policy.policyId,
      };
    }
  }
  return {
    refundClaim: policy.defaultClaim,
    refundClaimSource: policy.defaultClaim === "unknown" ? "no_matching_rule" : "explicit_policy",
    policyId: policy.policyId,
  };
}

function exactMatch(match, facts) {
  for (const [key, value] of Object.entries(match)) {
    if (facts?.[key] !== value) return false;
  }
  return true;
}

export function policiesAreSameDocument(a, b) {
  if (!a || !b) return false;
  return a.policyId === b.policyId && a.termsVersion === b.termsVersion;
}
