/**
 * Public formation HTTP client matching /agents/http-quickstart contracts.
 * Zero dependencies beyond Node built-ins (fetch, URL, AbortController).
 * Agents never claim, pay, or invent grants.
 */
import { collectSecrets } from "./lib/redact.mjs";
import {
  DEFAULT_ORIGIN,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
  HttpClientError,
  createTransport,
} from "./lib/http.mjs";

export { HttpClientError, DEFAULT_ORIGIN };

const TRI = new Set(["yes", "no", "unknown"]);
const ASSESSMENT_FIELDS = new Set([
  "goal",
  "hasUsEntity",
  "hasEin",
  "jurisdictionKnown",
  "selectedState",
  "providerRequiresUsEntity",
  "providerRequiresEin",
  "foreignOwnedCaution",
]);
const PREPARATION_FIELDS = new Set([
  "intendedEmail",
  "goal",
  "jurisdiction",
  "existingEntityStatus",
  "assessmentOutcome",
  "providerPath",
  "notes",
]);
const PREPARE_FIELDS = new Set(["intendedEmail", "assessmentOutcome", "preparation"]);
const REFUSED_PREPARE = new Set(["already_satisfied", "not_needed_now", "insufficient_information"]);
const TERMINAL_OUTCOMES = new Set([
  "already_satisfied",
  "not_needed_now",
  "insufficient_information",
]);
const EXISTING_ENTITY = new Set(["none", "has_entity", "has_ein", "unknown"]);

function rejectUnknown(body, allowed, label) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpClientError({ code: "invalid_input", message: `${label} must be an object` });
  }
  const extra = Object.keys(body).filter((key) => !allowed.has(key));
  if (extra.length) {
    throw new HttpClientError({ code: "invalid_input", message: `${label} has unsupported fields` });
  }
}

function requireString(value, label, { max, min = 1, optional = false } = {}) {
  if (value == null) {
    if (optional) return undefined;
    throw new HttpClientError({ code: "invalid_input", message: `${label} is required` });
  }
  if (typeof value !== "string") {
    throw new HttpClientError({ code: "invalid_input", message: `${label} must be a string` });
  }
  if (value.length < min) {
    throw new HttpClientError({ code: "invalid_input", message: `${label} must not be empty` });
  }
  if (max != null && value.length > max) {
    throw new HttpClientError({ code: "invalid_input", message: `${label} exceeds ${max} characters` });
  }
  return value;
}

function optionalTri(value, label) {
  if (value == null) return undefined;
  if (!TRI.has(value)) {
    throw new HttpClientError({ code: "invalid_input", message: `${label} must be yes, no, or unknown` });
  }
  return value;
}

export function validateAssessmentInput(body = {}) {
  rejectUnknown(body, ASSESSMENT_FIELDS, "assessment");
  const out = {};
  if (body.goal != null) out.goal = requireString(body.goal, "goal", { max: 500, min: 0 });
  for (const key of [
    "hasUsEntity",
    "hasEin",
    "jurisdictionKnown",
    "providerRequiresUsEntity",
    "providerRequiresEin",
  ]) {
    const v = optionalTri(body[key], key);
    if (v) out[key] = v;
  }
  if (body.selectedState != null) {
    out.selectedState = requireString(body.selectedState, "selectedState", { max: 80, min: 0 });
  }
  if (body.foreignOwnedCaution != null) {
    if (typeof body.foreignOwnedCaution !== "boolean") {
      throw new HttpClientError({ code: "invalid_input", message: "foreignOwnedCaution must be a boolean" });
    }
    out.foreignOwnedCaution = body.foreignOwnedCaution;
  }
  return out;
}

function validatePreparation(body) {
  rejectUnknown(body, PREPARATION_FIELDS, "preparation");
  const out = {};
  if (body.intendedEmail != null) {
    out.intendedEmail = requireString(body.intendedEmail, "preparation.intendedEmail", { max: 320 });
  }
  if (body.goal != null) out.goal = requireString(body.goal, "preparation.goal", { max: 500, min: 0 });
  if (body.jurisdiction != null) {
    out.jurisdiction = requireString(body.jurisdiction, "preparation.jurisdiction", { max: 80, min: 0 });
  }
  if (body.existingEntityStatus != null) {
    const status = requireString(body.existingEntityStatus, "preparation.existingEntityStatus");
    if (!EXISTING_ENTITY.has(status)) {
      throw new HttpClientError({
        code: "invalid_input",
        message: "preparation.existingEntityStatus must be none, has_entity, has_ein, or unknown",
      });
    }
    out.existingEntityStatus = status;
  }
  if (body.assessmentOutcome != null) {
    out.assessmentOutcome = requireString(body.assessmentOutcome, "preparation.assessmentOutcome", {
      max: 80,
      min: 0,
    });
  }
  if (body.providerPath != null) {
    out.providerPath = requireString(body.providerPath, "preparation.providerPath", { max: 200, min: 0 });
  }
  if (body.notes != null) {
    out.notes = requireString(body.notes, "preparation.notes", { max: 1000, min: 0 });
  }
  return out;
}

export function validatePrepareInput(body = {}) {
  rejectUnknown(body, PREPARE_FIELDS, "prepare");
  if (body.preparation && typeof body.preparation === "object") {
    for (const key of Object.keys(body.preparation)) {
      const n = key.toLowerCase();
      if (
        n.includes("passport") ||
        n === "ssn" ||
        n.includes("document") ||
        n.includes("secret") ||
        n.includes("token")
      ) {
        throw new HttpClientError({
          code: "invalid_input",
          message: "preparation must not include confidential fields",
        });
      }
    }
  }
  const out = {};
  if (body.intendedEmail != null) {
    out.intendedEmail = requireString(body.intendedEmail, "intendedEmail", { max: 320 });
  }
  if (body.assessmentOutcome != null) {
    out.assessmentOutcome = requireString(body.assessmentOutcome, "assessmentOutcome", { max: 80, min: 0 });
  }
  if (body.preparation != null) out.preparation = validatePreparation(body.preparation);
  const outcome = out.preparation?.assessmentOutcome?.trim() || out.assessmentOutcome?.trim();
  if (outcome && REFUSED_PREPARE.has(outcome)) {
    throw new HttpClientError({
      code: "invalid_input",
      message: `Refusing to prepare an application for ${outcome} outcomes`,
    });
  }
  return out;
}

export function validateApplicationId(value) {
  const id = requireString(value, "applicationId");
  if (id.length > 256 || /[\u0000-\u0020\u007f\\/?#]/.test(id)) {
    throw new HttpClientError({ code: "invalid_input", message: "applicationId is not a valid identifier" });
  }
  return id;
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeHttpsLink(value, origin) {
  try {
    if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
    const url = new URL(value, origin);
    const okProtocol =
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1"));
    return okProtocol && url.origin === origin && !url.username && !url.password && !url.hash ? url : null;
  } catch {
    return null;
  }
}

function validateAssessPayload(payload) {
  const a = payload?.assessment;
  return (
    object(payload) &&
    object(a) &&
    typeof a.outcome === "string" &&
    typeof a.summary === "string" &&
    a.createsCheckout === false &&
    payload.deploymentStatus === "available"
  );
}

function validatePreparePayload(payload, origin, intendedEmail) {
  if (!object(payload) || typeof payload.complete !== "boolean") return false;
  if (typeof payload.applicationId !== "string" || typeof payload.reviewUrl !== "string") return false;
  const review = safeHttpsLink(payload.reviewUrl, origin);
  if (!review || review.pathname !== `/review/${payload.applicationId}` || review.search) return false;
  if (payload.complete === true) {
    const claim = safeHttpsLink(payload.claimUrl, origin);
    const emailOk =
      !intendedEmail ||
      payload.intendedEmailNormalized === String(intendedEmail).trim().toLowerCase();
    return (
      emailOk &&
      payload.status === "provisional" &&
      claim &&
      claim.pathname === review.pathname &&
      [...claim.searchParams].length === 1 &&
      claim.searchParams.get("claim") === payload.claimToken &&
      typeof payload.claimToken === "string"
    );
  }
  return payload.status === "provisional_incomplete" && payload.claimToken === null;
}

function validateStatusPayload(payload, applicationId, origin) {
  const s = payload?.status;
  if (!object(payload) || !object(s) || s.applicationId !== applicationId) return false;
  if (payload.deploymentStatus !== "available") return false;
  if (s.nextAction?.url && !safeHttpsLink(s.nextAction.url, origin)) return false;
  return typeof s.einIssued === "boolean";
}

function validateCatalog(payload) {
  return (
    object(payload) &&
    payload.schema === "ein.agent-service-catalog.v1" &&
    typeof payload.catalogVersion === "string"
  );
}

function validateOpenApi(payload) {
  return (
    object(payload) &&
    payload.openapi === "3.1.0" &&
    object(payload.paths) &&
    object(payload.paths["/api/agent/v1/assessments"]) &&
    object(payload.paths["/api/agent/v1/applications"]) &&
    object(payload.paths["/api/agent/v1/applications/{applicationId}/status"])
  );
}

export class FormationHttpClient {
  #transport;
  #grantToken;

  constructor({
    origin = DEFAULT_ORIGIN,
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    grantToken = null,
    grantOrigin = DEFAULT_ORIGIN,
  } = {}) {
    this.#transport = createTransport({ origin, fetch: fetchImpl, timeoutMs, maxResponseBytes });
    if (grantToken && grantOrigin !== this.#transport.origin) {
      throw new HttpClientError({
        code: "invalid_input",
        message: "grantOrigin must exactly match the request origin",
      });
    }
    this.#grantToken = typeof grantToken === "string" && grantToken ? grantToken : null;
  }

  get origin() {
    return this.#transport.origin;
  }

  /** GET /api/v1/service-catalog */
  async discoverCatalog() {
    const { payload } = await this.#transport.request("GET", "/api/v1/service-catalog", {
      success: [200],
    });
    if (!validateCatalog(payload)) {
      throw new HttpClientError({
        code: "invalid_response",
        message: "catalog response does not match the published contract",
      });
    }
    return { catalog: payload };
  }

  /** GET /api/agent/v1/openapi.json */
  async discoverOpenApi() {
    const { payload } = await this.#transport.request("GET", "/api/agent/v1/openapi.json", {
      success: [200],
    });
    if (!validateOpenApi(payload)) {
      throw new HttpClientError({
        code: "invalid_response",
        message: "OpenAPI response does not match the published contract",
      });
    }
    return { openapi: payload };
  }

  /** Discover catalog + formation OpenAPI (http-quickstart step 01). */
  async discover() {
    const [catalog, openapi] = await Promise.all([this.discoverCatalog(), this.discoverOpenApi()]);
    return { ...catalog, ...openapi, origin: this.origin };
  }

  /** POST /api/agent/v1/assessments — operator-supplied AssessmentInput only. */
  async assess(input = {}) {
    const body = validateAssessmentInput(input);
    const { payload } = await this.#transport.request("POST", "/api/agent/v1/assessments", {
      body,
      success: [200],
    });
    if (!validateAssessPayload(payload)) {
      throw new HttpClientError({
        code: "invalid_response",
        message: "assessment response does not match the published contract",
      });
    }
    const outcome = payload.assessment.outcome;
    return {
      assessment: payload.assessment,
      deploymentStatus: payload.deploymentStatus,
      terminal: TERMINAL_OUTCOMES.has(outcome),
      note: TERMINAL_OUTCOMES.has(outcome)
        ? "Terminal outcome — do not prepare."
        : "Assessment only. Never creates checkout. Prepare only when explicitly invoked.",
    };
  }

  /**
   * POST /api/agent/v1/applications — provisional prepare.
   * Call only when explicitly invoked. No idempotency key; never auto-retry unknown outcomes.
   */
  async prepare(input = {}) {
    const body = validatePrepareInput(input);
    const secrets = collectSecrets(this.#grantToken);
    const { payload } = await this.#transport.request("POST", "/api/agent/v1/applications", {
      body,
      success: [201],
      mutation: true,
      secrets,
    });
    const intendedEmail = body.intendedEmail ?? body.preparation?.intendedEmail;
    if (!validatePreparePayload(payload, this.origin, intendedEmail)) {
      throw new HttpClientError({
        code: "unknown_outcome",
        message:
          "Mutation result is unknown. Do not retry automatically. Reconcile before preparing again (each prepare creates a new application; the API has no idempotency key).",
        operation: "POST /api/agent/v1/applications",
        retryable: false,
      });
    }
    if (payload.complete) {
      return {
        applicationId: payload.applicationId,
        status: payload.status,
        preparation: payload.preparation,
        complete: true,
        intendedEmailNormalized: payload.intendedEmailNormalized,
        claimUrl: new URL(payload.claimUrl, this.origin).href,
        reviewUrl: new URL(payload.reviewUrl, this.origin).href,
        claimToken: payload.claimToken,
        deploymentStatus: payload.deploymentStatus,
        note:
          payload.note ||
          "Provisional case created. Hand claim/review to the intended human. Agents do not claim or pay.",
      };
    }
    return {
      applicationId: payload.applicationId,
      status: payload.status,
      preparation: payload.preparation,
      complete: false,
      reason: payload.reason,
      reviewUrl: new URL(payload.reviewUrl, this.origin).href,
      claimToken: null,
      deploymentStatus: payload.deploymentStatus,
      note: payload.note,
    };
  }

  /**
   * GET /api/agent/v1/applications/{id}/status
   * Grant must come from constructor / EIN_AGENT_GRANT / EIN_AGENT_GRANT_FILE — never invent.
   */
  async status({ applicationId } = {}) {
    const id = validateApplicationId(applicationId);
    const token = this.#grantToken;
    if (!token || typeof token !== "string") {
      throw new HttpClientError({
        status: 401,
        code: "missing_grant",
        message:
          "A scoped agent grant is required for status. Supply EIN_AGENT_GRANT or EIN_AGENT_GRANT_FILE — never invent grants.",
      });
    }
    const secrets = collectSecrets(token, this.#grantToken);
    const { payload } = await this.#transport.request(
      "GET",
      `/api/agent/v1/applications/${encodeURIComponent(id)}/status`,
      {
        grantToken: token,
        success: [200],
        secrets,
      },
    );
    if (!validateStatusPayload(payload, id, this.origin)) {
      throw new HttpClientError({
        code: "invalid_response",
        message: "status response does not match the published contract",
      });
    }
    return {
      status: payload.status,
      deploymentStatus: payload.deploymentStatus,
      note: "Status is redacted by the server. Payment is not EIN issued. Humans issue and revoke grants.",
    };
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `FormationHttpClient { origin: ${this.origin}, grantToken: [redacted] }`;
  }
}
