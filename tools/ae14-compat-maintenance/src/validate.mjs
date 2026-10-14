import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../../recurring-job-recipes/lib/hash.mjs";
import {
  containsHostileMarkup,
  credentialHits,
  looksLikeFilesystemPath,
} from "../../result-reuse/src/omit.mjs";
import { parseAtoms } from "./fee.mjs";
import { PINS, RECEIPT_HEADS } from "./pins.mjs";
import { finish } from "./result.mjs";

const REQUEST_SCHEMA = "samedaydesk.compat-maintenance-request.v1";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const REQUEST_KEYS = new Set([
  "schema",
  "occurrenceId",
  "clock",
  "expiry",
  "taskId",
  "distinctTaskId",
  "subject",
  "sequence",
  "priorPath",
  "currentFixturePath",
  "fields",
  "applicability",
  "procurement",
  "economics",
  "review",
  "horizonHours",
  "replayPayment",
  "liveSafe",
  "enqueue",
  "schedule",
  "timer",
  "rerunSupplier228200",
  "forceRepurchase",
  "claimHttp200Useful",
  "priorAttempt",
  "optIn",
  "annotation",
  "e01Head",
  "e02Head",
  "e06Head",
  "tenant",
  "authorityTenant",
]);

const APPLICABILITY_KEYS = new Set([
  "sourceChanged",
  "licensePlane",
  "accessWithdrawn",
  "rightsCleared",
  "applicabilityMiss",
  "inheritFull",
]);

const PROCUREMENT_KEYS = new Set([
  "mandateState",
  "coldProfile",
  "incumbentProfile",
  "incumbentPid",
  "actorPid",
  "actorIsMandatePrincipal",
  "priorSpend",
  "reusableOutput",
  "inheritedAuthorityRequested",
]);

const ECONOMICS_KEYS = new Set([
  "termsVersion",
  "grossAtoms",
  "captures",
  "declaredEffort",
  "observedEffort",
  "reviewBurden",
  "modeledCost",
  "cashCost",
  "operation",
  "feeMode",
  "tokenPriceRecommendation",
  "applyNewFee",
  "legacyRewardsAtoms",
]);

const REVIEW_KEYS = new Set([
  "reviewer",
  "decision",
  "operatorCapture",
  "presentedReceipt",
  "presentedReceiptOccurrenceId",
  "presentedReceiptTaskId",
  "expectedReviewer",
]);

const ALLOWED_LICENSE = new Set(["mit", "owner_qa"]);
const OPERATIONS = new Set(["quote", "withdrawal", "unearned_reclaim", "post_capture_refund"]);
const ZERO_LIKE = new Set([0, "0", "0.0"]);

export function prepare(request) {
  const pins = loadPins();
  if (!pins.ok) return pins;

  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return stop("invalid_request", "request must be an object");
  }
  for (const key of Object.keys(request)) {
    if (!REQUEST_KEYS.has(key)) return stop("unknown_request_field", key);
  }
  if (request.schema !== REQUEST_SCHEMA) return stop("schema_mismatch", REQUEST_SCHEMA);
  if (!cleanId(request.occurrenceId)) return stop("occurrence_id_required", "occurrenceId is required");
  if (!cleanId(request.taskId) || !cleanId(request.distinctTaskId)) {
    return stop("task_ids_required", "two task ids are required");
  }
  if (request.taskId === request.distinctTaskId) {
    return stop("tasks_not_distinct", "the maintenance task and the other task must differ");
  }
  if (!cleanId(request.subject)) return stop("subject_required", "subject is required");
  if (!Number.isInteger(request.sequence) || request.sequence < 1) {
    return stop("sequence_required", "sequence must be a positive integer");
  }
  if (!iso(request.clock)) return stop("clock_required", "clock must be an explicit UTC instant");
  if (request.expiry != null && !iso(request.expiry)) return stop("expiry_invalid", "expiry must be a UTC instant");
  if (request.tenant !== request.authorityTenant || !cleanId(request.tenant)) {
    return stop("tenant_refused", "tenant must match the owning authority");
  }
  if (request.annotation && typeof request.annotation === "object" && Object.keys(request.annotation).length > 0) {
    return stop("authority_annotation_refused", "a client annotation cannot set tenant, fee, license, or permission");
  }
  if (request.e01Head != null && request.e01Head !== RECEIPT_HEADS.e01) {
    return stop("consumed_head_mismatch", "e01 head is not the received receipt");
  }
  if (request.e02Head != null && request.e02Head !== RECEIPT_HEADS.e02) {
    return stop("consumed_head_mismatch", "e02 head is not the received receipt");
  }
  if (request.e06Head != null && request.e06Head !== RECEIPT_HEADS.e06) {
    return stop("consumed_head_mismatch", "e06 head is not the received receipt");
  }
  if (request.rerunSupplier228200 === true) {
    return stop("supplier_228200_no_delta", "supplier 228200 stays a no-delta input and is not rerun");
  }
  if (request.enqueue === true) return stop("queue_refused", "this occurrence does not open a queue");
  if (request.timer === true || (request.schedule != null && request.schedule !== "finite-once")) {
    return stop("scheduler_refused", "this occurrence does not start a timer or scheduler");
  }
  if (request.forceRepurchase === true) {
    return stop("repurchase_refused", "retained output is not repurchased");
  }
  if (request.liveSafe === true) return stop("live_fetch_refused", "this occurrence does not fetch");
  if (request.replayPayment === true && request.priorAttempt) {
    return stop("payment_replay_blocked", "a retry must not replay payment");
  }

  const applicability = checkApplicability(request.applicability);
  if (!applicability.ok) return applicability;
  const procurement = checkProcurement(request.procurement);
  if (!procurement.ok) return procurement;
  const economics = checkEconomics(request.economics);
  if (!economics.ok) return economics;
  const review = checkReview(request.review);
  if (!review.ok) return review;
  if (!Array.isArray(request.fields) || request.fields.length === 0 || request.fields.some((field) => typeof field !== "string" || field === "")) {
    return stop("fields_required", "fields must name the compatibility contract");
  }
  if (typeof request.priorPath !== "string" || request.priorPath === "") {
    return stop("missing_prior", "immutable prior artifact is required");
  }
  if (typeof request.currentFixturePath !== "string" || request.currentFixturePath === "") {
    return stop("current_required", "a current fixture is required");
  }
  if (request.horizonHours != null && (!Number.isInteger(request.horizonHours) || request.horizonHours < 0)) {
    return stop("horizon_invalid", "horizonHours must be a non-negative integer when supplied");
  }
  if (request.priorAttempt != null) {
    if (!request.priorAttempt || typeof request.priorAttempt !== "object" || Array.isArray(request.priorAttempt)) {
      return stop("ambiguous_readback_mismatch", "priorAttempt must be the original occurrence");
    }
    if (request.priorAttempt.occurrenceId !== request.occurrenceId || typeof request.priorAttempt.digest !== "string") {
      return stop("ambiguous_readback_mismatch", "priorAttempt must carry this occurrence id and its digest");
    }
  }

  return {
    ok: true,
    value: {
      ...request,
      applicability: applicability.value,
      procurement: procurement.value,
      economics: economics.value,
      review: review.value,
    },
  };
}

function loadPins() {
  let parsed;
  try {
    const path = fileURLToPath(new URL("../PINS.json", import.meta.url));
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return stop("pin_file_unreadable", "PINS.json is required");
  }
  if (sha256Hex(parsed) !== sha256Hex(PINS)) return stop("pin_file_mismatch", "PINS.json does not match the consumed heads");
  return { ok: true };
}

function checkApplicability(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return stop("applicability_required", "applicability facts are required");
  }
  for (const key of Object.keys(value)) {
    if (!APPLICABILITY_KEYS.has(key)) return stop("unknown_applicability_field", key);
  }
  for (const key of ["sourceChanged", "accessWithdrawn", "rightsCleared", "applicabilityMiss", "inheritFull"]) {
    if (typeof value[key] !== "boolean") return stop("applicability_required", `${key} must be boolean`);
  }
  if (typeof value.licensePlane !== "string" || value.licensePlane === "") {
    return stop("applicability_required", "licensePlane is required");
  }
  if (credentialHits(value.licensePlane).length || containsHostileMarkup(value.licensePlane)) {
    return stop("applicability_required", "licensePlane is not a usable label");
  }
  return { ok: true, value };
}

function checkProcurement(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return stop("procurement_required", "procurement facts are required");
  }
  for (const key of Object.keys(value)) {
    if (!PROCUREMENT_KEYS.has(key)) return stop("unknown_procurement_field", key);
  }
  if (value.mandateState !== "active" && value.mandateState !== "revoked") {
    return stop("procurement_required", "mandateState must be active or revoked");
  }
  if (!cleanId(value.coldProfile) || !cleanId(value.incumbentProfile)) {
    return stop("procurement_required", "cold and incumbent profiles are required");
  }
  if (!Number.isSafeInteger(value.actorPid) || !Number.isSafeInteger(value.incumbentPid)) {
    return stop("procurement_required", "actor and incumbent pids are required");
  }
  if (typeof value.actorIsMandatePrincipal !== "boolean" || typeof value.reusableOutput !== "boolean") {
    return stop("procurement_required", "mandate principal and reusable output must be boolean");
  }
  if (value.inheritedAuthorityRequested !== false && value.inheritedAuthorityRequested !== true) {
    return stop("procurement_required", "inheritedAuthorityRequested must be boolean");
  }
  if (!["outcome_unknown", "none", "unobserved"].includes(value.priorSpend)) {
    return stop("procurement_required", "priorSpend must stay an explicit uncertainty label");
  }
  if (value.inheritedAuthorityRequested === true) {
    return stop("inherited_authority", "a packet from the other task does not inherit authority");
  }
  if (value.mandateState === "revoked") {
    if (value.coldProfile === value.incumbentProfile) return stop("cold_takeover_refused", "same_profile");
    if (value.actorPid === value.incumbentPid) return stop("cold_takeover_refused", "incumbent_pid");
    if (value.actorIsMandatePrincipal === true) return stop("cold_takeover_refused", "mandate_principal");
  }
  return { ok: true, value };
}

function checkEconomics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return stop("economics_required", "economics facts are required");
  }
  for (const key of Object.keys(value)) {
    if (!ECONOMICS_KEYS.has(key)) return stop("unknown_economics_field", key);
  }
  if (!["new-market", "221400", "234100"].includes(value.termsVersion)) {
    return stop("economics_required", "termsVersion must be new-market, 221400, or 234100");
  }
  if (value.tokenPriceRecommendation != null) {
    return stop("guessed_token_price", "token price recommendation stays null");
  }
  if (ZERO_LIKE.has(value.reviewBurden) || ZERO_LIKE.has(value.observedEffort) || ZERO_LIKE.has(value.modeledCost)) {
    return stop("unknown_stored_as_zero", "unknown effort, review burden, and modeled cost are not zero");
  }
  if (typeof value.cashCost === "number" || (typeof value.cashCost === "string" && value.cashCost !== "unknown")) {
    return stop("modeled_cost_presented_as_cash", "cash cost stays unknown");
  }
  if (value.feeMode === "cumulative") {
    return stop("cumulative_fee", "the fee is floor division on each capture, not on a summed gross");
  }
  if (value.feeMode != null && value.feeMode !== "per-capture") {
    return stop("economics_required", "feeMode must be per-capture");
  }
  if (value.operation != null && !OPERATIONS.has(value.operation)) {
    return stop("economics_required", "operation must be quote, withdrawal, unearned reclaim, or post-capture refund");
  }
  if ((value.termsVersion === "221400" || value.termsVersion === "234100") && value.applyNewFee === true) {
    return stop("legacy_reprice_refused", "221400 and 234100 nets are not repriced", {
      useful: true,
      usefulness: "useful_negative",
      economics: legacyEconomics(value.termsVersion, value.legacyRewardsAtoms),
    });
  }
  const operation = value.operation ?? "quote";
  let captures = null;
  if (operation === "quote" && value.termsVersion === "new-market") {
    const parsed = parseCaptureList(value);
    if (!parsed.ok) return parsed;
    captures = parsed.value;
  }
  return {
    ok: true,
    value: {
      ...value,
      operation,
      feeMode: "per-capture",
      tokenPriceRecommendation: null,
      captures,
    },
  };
}

function parseCaptureList(value) {
  const source = value.captures ?? (value.grossAtoms == null ? null : [value.grossAtoms]);
  if (!Array.isArray(source) || source.length === 0) return stop("gross_required", "a new-market quote needs a gross atom string");
  if (value.captures && value.grossAtoms != null) return stop("gross_required", "supply captures or one gross, not both");
  const captures = [];
  for (const item of source) {
    const parsed = parseAtoms(item);
    if (!parsed.ok) return stop(parsed.code, "capture gross must be a non-negative integer string");
    captures.push(parsed.value);
  }
  return { ok: true, value: captures };
}

function checkReview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return stop("review_required", "review facts are required");
  }
  for (const key of Object.keys(value)) {
    if (!REVIEW_KEYS.has(key)) return stop("unknown_review_field", key);
  }
  if (value.decision != null && value.decision !== "accept" && value.decision !== "reject") {
    return stop("review_required", "decision must be accept, reject, or absent");
  }
  if (value.reviewer != null && !cleanId(value.reviewer)) return stop("review_required", "reviewer id is not usable");
  if (value.expectedReviewer != null && !cleanId(value.expectedReviewer)) {
    return stop("review_required", "expected reviewer id is not usable");
  }
  if (value.expectedReviewer && value.reviewer !== value.expectedReviewer) {
    return stop("wrong_reviewer", "the reviewer is not the authorized reviewer");
  }
  if (value.operatorCapture != null && typeof value.operatorCapture !== "boolean") {
    return stop("review_required", "operatorCapture must be boolean");
  }
  if (value.presentedReceipt != null && typeof value.presentedReceipt !== "boolean") {
    return stop("review_required", "presentedReceipt must be boolean");
  }
  return { ok: true, value };
}

export function legacyEconomics(termsVersion, suppliedRewards) {
  if (termsVersion === "234100") {
    return {
      termsVersion,
      applicable: true,
      quoteOnly: true,
      feeApplied: false,
      repriced: false,
      feeAtoms: "0",
      secondFeeAtoms: "0",
      netUsdc: PINS.consumed.legacy234100.netUsdc,
      netAtoms: null,
      atomicCountInvented: false,
      operation: "legacy-unchanged",
    };
  }
  const rewards = Array.isArray(suppliedRewards) && suppliedRewards.length > 0
    ? suppliedRewards.map(String)
    : [...PINS.consumed.legacy221400.rewardsAtoms];
  return {
    termsVersion: "221400",
    applicable: true,
    quoteOnly: true,
    feeApplied: false,
    repriced: false,
    feeAtoms: "0",
    secondFeeAtoms: "0",
    rewardsAtoms: rewards,
    rewardsUnchanged: true,
    operation: "legacy-unchanged",
  };
}

export function blockingReasons(applicability, currentFields) {
  const reasons = [];
  if (applicability.accessWithdrawn) reasons.push("access_withdrawn");
  if (!ALLOWED_LICENSE.has(applicability.licensePlane)) reasons.push("license_plane");
  if (applicability.rightsCleared !== true) reasons.push("rights_not_cleared");
  if (applicability.applicabilityMiss) reasons.push("applicability_miss");
  if (applicability.inheritFull) reasons.push("inherit_full");
  if (currentFields && Object.prototype.hasOwnProperty.call(currentFields, "sku") && (currentFields.sku == null || currentFields.sku === "")) {
    reasons.push("missing_sku");
  }
  return reasons;
}

function cleanId(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text || text.length > 128) return false;
  if (text !== value) return false;
  if (credentialHits(text).length || containsHostileMarkup(text) || looksLikeFilesystemPath(text)) return false;
  return true;
}

function iso(value) {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function stop(code, message, extra = {}) {
  return {
    ok: false,
    result: finish({
      ok: false,
      code,
      message,
      useful: extra.useful ?? false,
      usefulness: extra.usefulness ?? "not_useful",
      economics: extra.economics ?? null,
      executed: false,
      posts: 0,
      acceptancePosts: 0,
      acceptance: "refused",
    }),
  };
}
