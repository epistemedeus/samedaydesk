/** NL-DISTRIBUTION-03 — Acquisition package constants (extends portable catalog). */

export {
  INVENTORY_SCHEMA,
  CATALOG_SCHEMA,
  AVAILABILITY_STATUS,
  ERROR_CODES,
  FORBIDDEN_INVENTORY_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  PACKAGE_KINDS,
} from "../../03/src/constants.mjs";

export const ACQUISITION_SCHEMA = "pilot.nl.distribution.acquisition_package.v1";
export const LISTING_CAPTURE_SCHEMA = "pilot.nl.distribution.listing_capture.v1";

/** Canonical publicly discoverable Grexal marketplace route (S149 / S155). */
export const GREXAL_PUBLIC = Object.freeze({
  agentId: "j970cajvv6wbrmy64s2f4ajzw18e5j2q",
  deploymentId: "j570f14047dzpkhc0trh3fnp8s8e43sd",
  deploymentVersion: "v1",
  marketplaceUrl: "https://grexal.ai/marketplace/j970cajvv6wbrmy64s2f4ajzw18e5j2q",
  matchedPathPattern: "/marketplace/[agentId]",
  listPriceUsd: 0.02,
  estimateReserveUsd: 0.025,
  estimateReserveIsCharge: false,
  category: "developer-tools",
  tags: Object.freeze(["code", "diff", "evidence", "validation"]),
  homepage: "samedaydesk.com",
  customerExecutionRevenuePayout: false,
});

/** I/O cited from grexal.json (preserve package). */
export const GREXAL_IO = Object.freeze({
  cite: "/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package/grexal.json",
  inputs: Object.freeze([
    { name: "unifiedDiff", type: "text", required: false, note: "Precomputed unified diff; preferred when agent should not run git" },
    { name: "repoPath", type: "text", required: false, note: "Local git checkout; optional when unifiedDiff supplied" },
    { name: "baseRef", type: "text", required: false },
    { name: "headRef", type: "text", required: false },
    { name: "buyerCriteria", type: "json", required: false },
    { name: "maxDiffBytes", type: "number", required: false },
  ]),
  outputs: Object.freeze([
    { name: "summary", type: "text", note: "One-line packaging result; always notes paidModelCalls=0" },
    { name: "diffBytes", type: "number", note: "Byte length of captured unified diff" },
    { name: "paidModelCalls", type: "number", note: "Always 0" },
    { name: "acceptanceReport", type: "json" },
    { name: "evidencePack", type: "json" },
  ]),
});

export const ACQUISITION_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  INVENTED_URL: "invented_url",
  PAID_WITHOUT_CONFIRMATION: "paid_without_confirmation",
  FORBIDDEN_CLAIM: "forbidden_claim",
  SSR_COMMERCIAL_INVENTION: "ssr_commercial_invention",
});
