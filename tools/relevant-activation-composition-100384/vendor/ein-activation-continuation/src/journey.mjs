/** SPDX-License-Identifier: MIT
 * Discover, assess, bound prepare, and grant-scoped status.
 * The continuation file is the caller record. The agent does not claim or pay.
 */
import { parseTransportEnv, createContinuationTransport } from "./adapters.mjs";
import { ContinuationError, recovery } from "./errors.mjs";
import { publicClient } from "./locate.mjs";
import {
  customerKeyHash,
  hashesEqual,
  readContinuation,
  writeContinuation,
} from "./store.mjs";
import {
  APPLICATION_STATUSES,
  CLAIMABLE_OUTCOMES,
  TERMINAL_OUTCOMES,
  describeDiscovery,
  isLoopbackOrigin,
  resolveLinkOrigin,
  sameOriginLink,
  selectRoutes,
  sha256Json,
  surfacePath,
  termsFingerprint,
} from "./catalog.mjs";
import { publicView } from "./view.mjs";
import { assessmentFromContext } from "./context.mjs";
import { commandBudget } from "./deadline.mjs";

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const SECRET_KEY = /ssn|passport|secret|token|password|credential|authorization/i;

function envOf(options) {
  return options.env ?? process.env;
}

function requiredEnv(env, name, instruction) {
  const value = typeof env[name] === "string" ? env[name].trim() : "";
  if (!value) {
    throw new ContinuationError({
      code: "invalid_input",
      message: `${name} is required`,
      recovery: recovery("fix_input", instruction),
    });
  }
  return value;
}

function integerEnv(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw === "") return fallback;
  if (!/^\d+$/.test(String(raw))) {
    throw new ContinuationError({
      code: "invalid_input",
      message: `${name} must be an integer`,
      recovery: recovery("fix_input", `Set ${name} to a decimal integer or leave it unset.`),
    });
  }
  return Number(raw);
}

function canonicalOrigin(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ContinuationError({
      code: "invalid_input",
      message: "EIN_ACTIVATION_BASE_URL must be an origin URL",
      recovery: recovery("fix_input", "Set EIN_ACTIVATION_BASE_URL to https://ein.llc or an http loopback origin."),
    });
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "EIN_ACTIVATION_BASE_URL must be a scheme and host without a path, query, or credential",
      recovery: recovery("fix_input", "Pass only the API origin. Paths and credentials are refused."),
    });
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "origin must be https, or http only for loopback disposable QA",
      recovery: recovery("fix_input", "Use the https origin for a human handoff."),
    });
  }
  return url.origin;
}

function assertLane(lane, apiOrigin) {
  if (lane === "autonomous_machine_purchase") {
    throw new ContinuationError({
      code: "lane_refused",
      message: "Autonomous machine purchase is refused.",
      recovery: recovery(
        "stop",
        "This origin does not sell through an agent payment. A human claims and pays, or the caller stops.",
      ),
    });
  }
  if (lane !== "agent_assisted_human" && lane !== "disposable_owner_qa") {
    throw new ContinuationError({
      code: "lane_refused",
      message: "EIN_CONTINUATION_LANE is not a supported lane.",
      recovery: recovery(
        "fix_input",
        "Use agent_assisted_human for the https origin or disposable_owner_qa for a loopback API. Do not invent a purchase lane.",
      ),
    });
  }
  const loopback = isLoopbackOrigin(apiOrigin);
  if (lane === "agent_assisted_human" && loopback) {
    throw new ContinuationError({
      code: "lane_refused",
      message: "Agent-assisted human sales do not run against a loopback origin.",
      recovery: recovery(
        "use_recorded_origin",
        "Set EIN_CONTINUATION_LANE=disposable_owner_qa for this loopback API, or point EIN_ACTIVATION_BASE_URL at the https origin.",
      ),
    });
  }
  if (lane === "disposable_owner_qa" && !loopback) {
    throw new ContinuationError({
      code: "lane_refused",
      message: "Disposable owner QA cannot target a public origin.",
      recovery: recovery(
        "use_recorded_origin",
        "Use agent_assisted_human and the https origin for a real human handoff. Do not label a public origin as disposable QA.",
      ),
    });
  }
}

function loadIdentity(options) {
  const env = envOf(options);
  const file = requiredEnv(
    env,
    "EIN_CONTINUATION_FILE",
    "Set EIN_CONTINUATION_FILE to an owner-only path. Do not pass the continuation JSON on argv.",
  );
  const taskId = requiredEnv(
    env,
    "EIN_CONTINUATION_TASK_ID",
    "Set EIN_CONTINUATION_TASK_ID to the stable id for this task. A different id is a different task.",
  );
  if (!TASK_ID.test(taskId)) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "EIN_CONTINUATION_TASK_ID must be 8 to 80 URL-safe characters",
      recovery: recovery("fix_input", "Choose one stable task id and keep it for the later process."),
    });
  }
  const customerKey = requiredEnv(
    env,
    "EIN_CONTINUATION_CUSTOMER_KEY",
    "Set EIN_CONTINUATION_CUSTOMER_KEY in the environment. It is an opaque caller key, not a person's name or government id.",
  );
  if (customerKey.length < 12 || customerKey.length > 128 || /[\s\u0000-\u001f\u007f]/.test(customerKey)) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "EIN_CONTINUATION_CUSTOMER_KEY must be 12 to 128 characters without whitespace",
      recovery: recovery("fix_input", "Use the same opaque caller key in the later process."),
    });
  }
  const lane = typeof env.EIN_CONTINUATION_LANE === "string" && env.EIN_CONTINUATION_LANE.trim()
    ? env.EIN_CONTINUATION_LANE.trim()
    : "agent_assisted_human";
  const apiOrigin = canonicalOrigin(requiredEnv(
    env,
    "EIN_ACTIVATION_BASE_URL",
    "Set EIN_ACTIVATION_BASE_URL to the current API origin. Do not bake a machine path into the client.",
  ));
  assertLane(lane, apiOrigin);
  const selected = parseTransportEnv(env);
  return {
    env,
    file,
    taskId,
    customerKey,
    customerHash: customerKeyHash(customerKey),
    lane,
    apiOrigin,
    operationId: `task:${taskId}`,
    reassess: env.EIN_CONTINUATION_REASSESS === "1",
    showClaimUrl: options.showClaimUrl === true,
    timeoutMs: integerEnv(env, "EIN_CONTINUATION_TIMEOUT_MS", undefined),
    maxResponseBytes: integerEnv(env, "EIN_CONTINUATION_MAX_RESPONSE_BYTES", undefined),
    transport: selected.transport,
    catalogTransport: selected.catalogTransport,
  };
}

function bindRecord(identity, existing) {
  if (!existing) return null;
  if (existing.taskId !== identity.taskId) {
    throw new ContinuationError({
      code: "task_mismatch",
      message: "This continuation file belongs to a different task.",
      recovery: recovery(
        "stop",
        "Do not prepare another application in this file. Use the original task id, or create a new file for a new task.",
      ),
    });
  }
  if (!hashesEqual(existing.customerKeyHash, identity.customerHash)) {
    throw new ContinuationError({
      code: "customer_mismatch",
      message: "This continuation file belongs to a different caller.",
      recovery: recovery(
        "stop",
        "Refuse this customer key. Do not read status, replay prepare, or open another case with this file.",
      ),
    });
  }
  if (existing.lane !== identity.lane) {
    throw new ContinuationError({
      code: "lane_refused",
      message: "This continuation file is bound to a different lane.",
      recovery: recovery("stop", "Keep agent-assisted human sales and disposable owner QA in different files."),
    });
  }
  // A changed API origin is data. It is adopted only after the current catalog
  // is accepted. Grants are still refused unless EIN_AGENT_GRANT_ORIGIN matches
  // the origin about to be called. This is not a new login.
  if (existing.operationId !== identity.operationId) {
    throw new ContinuationError({
      code: "task_mismatch",
      message: "Stored operation id does not match this task.",
      recovery: recovery("stop", "Do not mint a new operation id for this task."),
    });
  }
  return existing;
}

function refuseCancelled(record) {
  if (record?.phase === "cancelled") {
    throw new ContinuationError({
      code: "continuation_cancelled",
      message: "This caller record is cancelled. The server case, if any, was not cancelled by this client.",
      recovery: recovery(
        "human_reviews_existing_case",
        "Do not prepare another application with this task id. The human still uses the existing review URL if a case was issued. This client cannot cancel or complete that case.",
      ),
    });
  }
}

function blankRecord(identity) {
  const now = new Date().toISOString();
  return {
    schema: "ein.activation-continuation.v1",
    taskId: identity.taskId,
    customerKeyHash: identity.customerHash,
    lane: identity.lane,
    apiOrigin: identity.apiOrigin,
    linkOrigin: null,
    operationId: identity.operationId,
    phase: "new",
    catalog: null,
    catalogObserved: null,
    taskFingerprint: null,
    assessment: null,
    applicationId: null,
    reviewUrl: null,
    claimUrl: null,
    intendedEmail: null,
    prepareBody: null,
    offer: null,
    declaredTransport: null,
    catalogTransport: null,
    uncertain: null,
    server: null,
    status: null,
    nextAction: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function persist(identity, record) {
  record.updatedAt = new Date().toISOString();
  writeContinuation(identity.file, record);
}

function nextActionFor(record) {
  if (record.phase === "cancelled") {
    return {
      kind: "stop",
      instruction: "Caller record is cancelled. Do not open another case with this task id.",
    };
  }
  if (record.phase === "prepare_uncertain") {
    return {
      kind: "replay_same_bound_prepare",
      instruction:
        "Run resume with the same file, task, caller key, and recipient. Do not choose a new operation id.",
    };
  }
  if (record.phase === "assess_uncertain") {
    return {
      kind: "explicit_reassess",
      instruction:
        "The assess reply was lost. Set EIN_CONTINUATION_REASSESS=1 only if a second stored assessment is acceptable. Do not prepare.",
    };
  }
  if (!record.assessment) {
    return {
      kind: "assess",
      instruction: "Submit one explicit operator task. Discovery does not invent a company or a person.",
    };
  }
  if (record.assessment.terminal) {
    return {
      kind: record.assessment.outcome === "insufficient_information" ? "clarify_prerequisite" : "stop",
      outcome: record.assessment.outcome,
      ...(record.assessment.outcome === "insufficient_information" ? {
        requiredInputs: record.assessment.unknowns.fields.filter((field) =>
          ["goal", "hasUsEntity", "providerRequiresUsEntity"].includes(field)),
      } : {}),
      instruction: record.assessment.nextSteps?.[0]
        || "Terminal outcome. Do not prepare, claim, or pay.",
    };
  }
  if (!record.applicationId) {
    if (record.assessmentExpired) return {
      kind: "explicit_reassess",
      instruction: "Assessment expired before a case existed. Reassess the same supplied facts explicitly, keeping this operation id.",
    };
    return {
      kind: "prepare_for_human_claim",
      outcome: record.assessment.outcome,
      instruction:
        "Prepare only for this task and recipient. The result is a human claim link, not payment or filing authority.",
    };
  }
  if (record.status?.complete === true) {
    return {
      kind: "fulfilled_observed",
      instruction:
        "Grant-scoped status reported fulfillment. That is not a new sale and not filing authority. Do not prepare again.",
    };
  }
  if (record.status?.applicationStatus === "claimed" || record.status?.applicationStatus === "quoted") {
    return {
      kind: "human_intake_or_payment",
      reviewUrl: record.reviewUrl,
      instruction:
        "The human still holds intake and payment. The agent does not pay, attest, or treat a link view as completion.",
    };
  }
  if (record.phase === "awaiting_human_claim" || record.server?.reconciled) {
    return {
      kind: "human_claim",
      reviewUrl: record.reviewUrl,
      requiredScope: {
        applicationId: record.applicationId,
        actor: "intended_recipient",
        verifiedEmailRequired: true,
        action: "claim",
      },
      continuationScope: { applicationId: record.applicationId, scopes: ["status"], issuer: "human_owner" },
      claimLink: { source: "customer_held_continuation", field: "claimUrl" },
      instruction:
        "Open the stored claimUrl and review this application with the intended verified email. The owner may issue a status-only grant for later reads.",
    };
  }
  return {
    kind: "status_when_granted",
    instruction: "A later process reads status only with a human-issued grant for this application.",
  };
}

function unknownsFor(input, assessment) {
  const fields = [];
  for (const key of [
    "hasUsEntity",
    "hasEin",
    "jurisdictionKnown",
    "providerRequiresUsEntity",
    "providerRequiresEin",
  ]) {
    if (input[key] == null || input[key] === "unknown") fields.push(key);
  }
  if (!input.goal) fields.push("goal");
  if (!input.selectedState) fields.push("selectedState");
  return {
    fields,
    rationale: Array.isArray(assessment.rationale) ? assessment.rationale : [],
  };
}

function missingStatusGrant(record) {
  return new ContinuationError({
    code: "missing_grant",
    status: 401,
    message: "A human-issued status grant is required.",
    recovery: {
      action: "human_claim_or_issue_grant",
      instruction: "The intended recipient reviews and claims this application if still unclaimed, then issues a status-only grant.",
      reviewUrl: record.reviewUrl,
      requiredScope: {
        applicationId: record.applicationId,
        actor: "intended_recipient_or_claimed_owner",
        verifiedEmailRequired: true,
      },
      continuationScope: { applicationId: record.applicationId, scopes: ["status"], issuer: "human_owner" },
      claimLink: { source: "customer_held_continuation", field: "claimUrl" },
    },
  });
}

function rejectSecrets(value) {
  if (typeof value === "string") {
    if (SSN.test(value)) {
      throw new ContinuationError({
        code: "invalid_input",
        message: "task input contains a secret-shaped value",
        recovery: recovery("fix_input", "Send only non-sensitive formation facts. Do not include an SSN or document."),
      });
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || key === "intendedEmail") {
      throw new ContinuationError({
        code: "invalid_input",
        message: "task input contains a field this client will not send",
        recovery: recovery(
          "fix_input",
          "Remove secrets and intendedEmail from the task JSON. The recipient belongs in EIN_CONTINUATION_INTENDED_EMAIL.",
        ),
      });
    }
    rejectSecrets(item);
  }
}

async function readTask(options, clientMod) {
  if (options.stdin?.isTTY) {
    throw new ContinuationError({
      code: "task_input_required",
      message: "assess reads the task JSON from stdin and will not wait on a terminal",
      recovery: recovery("fix_input", "Pipe one JSON object, for example examples/task-qualifying.json."),
    });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of options.stdin ?? process.stdin) {
    size += Buffer.byteLength(chunk);
    if (size > 32 * 1024) {
      throw new ContinuationError({
        code: "body_limit",
        message: "task JSON exceeds 32 KiB",
        recovery: recovery("fix_input", "Send one small non-sensitive task object."),
      });
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    throw new ContinuationError({
      code: "task_input_required",
      message: "assess requires an explicit task JSON document",
      recovery: recovery("fix_input", "Pipe the operator task. The client will not invent one."),
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ContinuationError({
      code: "invalid_input",
      message: "task JSON is not valid",
      recovery: recovery("fix_input", "Pipe one JSON object of non-sensitive formation facts."),
    });
  }
  rejectSecrets(parsed);
  try {
    return clientMod.validateAssessmentInput(assessmentFromContext(parsed));
  } catch (error) {
    throw new ContinuationError({
      code: "invalid_input",
      message: error instanceof Error ? error.message : "task input was rejected",
      recovery: recovery("fix_input", "Use only the public assessment fields. Leave unknown facts unknown."),
    });
  }
}

function recipient(identity, record, { required }) {
  const raw = identity.env.EIN_CONTINUATION_INTENDED_EMAIL;
  const email = typeof raw === "string" && raw.trim() ? raw.trim() : record?.intendedEmail ?? "";
  if (!email) {
    if (!required) return record?.intendedEmail ?? null;
    throw new ContinuationError({
      code: "recipient_required",
      message: "EIN_CONTINUATION_INTENDED_EMAIL is required before prepare",
      recovery: recovery(
        "human_supplies_recipient",
        "The operator sets the intended recipient in the environment. The agent does not invent a person or complete that field.",
      ),
    });
  }
  if (!EMAIL.test(email) || email.length > 320) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "intended recipient is not a single email address",
      recovery: recovery("fix_input", "Set EIN_CONTINUATION_INTENDED_EMAIL to the human who will claim."),
    });
  }
  if (record?.intendedEmail && record.intendedEmail !== email) {
    throw new ContinuationError({
      code: "recipient_changed",
      message: "This task is already bound to a different intended recipient.",
      recovery: recovery(
        "stop",
        "Do not prepare a second application. Resume with the original recipient, or start a new task file.",
      ),
    });
  }
  return email;
}

async function transportFor(identity, options) {
  const transport = await createContinuationTransport({
    apiOrigin: identity.apiOrigin,
    fetch: (url, init = {}) => {
      options.budget.signal.throwIfAborted();
      return (options.fetch ?? globalThis.fetch)(url, {
        ...init,
        signal: init.signal ? AbortSignal.any([init.signal, options.budget.signal]) : options.budget.signal,
      });
    },
    timeoutMs: identity.timeoutMs,
    maxResponseBytes: identity.maxResponseBytes,
    transport: identity.transport,
    catalogTransport: identity.catalogTransport,
  });
  for (const key of ["readCatalog", "readOpenApi", "request"]) {
    const run = transport[key].bind(transport);
    transport[key] = (...args) => options.budget.run(() => run(...args));
  }
  return transport;
}

async function discoverLive(identity, transport) {
  const catalogResponse = await transport.readCatalog();
  const catalog = catalogResponse.payload;
  const linkOrigin = resolveLinkOrigin(catalog, transport.origin);
  const openapiPath = surfacePath(catalog.machineEntry?.surfaces?.openapi, [transport.origin, linkOrigin]);
  const openapiResponse = await transport.readOpenApi(openapiPath);
  const openapi = openapiResponse.payload;
  const selected = selectRoutes(catalog, openapi);
  const fingerprint = termsFingerprint(catalog);
  const discovery = describeDiscovery({
    catalog,
    apiOrigin: transport.origin,
    linkOrigin,
    fingerprint,
    routes: selected.routes,
    human: selected.human,
  });
  return { catalog, openapi, linkOrigin, fingerprint, ...selected, discovery, openapiPath };
}

function adoptOrigin(record, apiOrigin) {
  if (!apiOrigin || record.apiOrigin === apiOrigin) return;
  record.previousApiOrigin = record.apiOrigin;
  record.apiOrigin = apiOrigin;
}

function rememberCatalog(record, live, { locked, apiOrigin }) {
  const snapshot = {
    schema: live.catalog.schema,
    catalogVersion: live.catalog.catalogVersion,
    termsFingerprint: live.fingerprint,
    openapiPath: live.openapiPath,
    routes: {
      assess: live.routes.assess_formation_need.path,
      prepare: live.routes.prepare_application.path,
      status: live.routes.get_application_status.path,
    },
  };
  if (!record.catalog || !locked) {
    record.catalog = snapshot;
    record.linkOrigin = live.linkOrigin;
    record.offer = live.discovery.offer ?? null;
    adoptOrigin(record, apiOrigin);
    return;
  }
  if (record.catalog.termsFingerprint !== live.fingerprint || record.linkOrigin !== live.linkOrigin) {
    record.catalogObserved = {
      catalogVersion: live.catalog.catalogVersion,
      termsFingerprint: live.fingerprint,
      linkOrigin: live.linkOrigin,
      observedAt: new Date().toISOString(),
    };
    throw new ContinuationError({
      code: "terms_changed",
      message: "Catalog terms changed after this task was prepared.",
      recovery: recovery(
        "human_reviews_current_offer",
        "Do not send the grant or claim link, and do not infer payment or filing authority. The human reviews the current offer at the stored review URL. A changed catalog is not a new login and not a new operation id.",
      ),
    });
  }
  for (const [key, path] of Object.entries(snapshot.routes)) {
    if (record.catalog.routes?.[key] !== path) {
      throw new ContinuationError({
        code: "contract_mismatch",
        message: `Current catalog moved the ${key} route.`,
        recovery: recovery("stop", "Do not call the old path or a new one for this task until the human reviews the change."),
      });
    }
  }
  adoptOrigin(record, apiOrigin);
}

function catalogLocked(record) {
  return Boolean(record.applicationId || record.phase === "prepare_uncertain" || record.prepareBody);
}

function commitCatalog(identity, record, live, locked) {
  try {
    rememberCatalog(record, live, { locked, apiOrigin: identity.apiOrigin });
  } catch (error) {
    if (error instanceof ContinuationError && error.code === "terms_changed") persist(identity, record);
    throw error;
  }
}

function applyAssessment(record, input, payload) {
  const assessment = payload.assessment;
  if (
    payload.filingAuthorization !== false
    || payload.deploymentStatus !== "available"
    || assessment?.createsCheckout !== false
    || typeof assessment?.outcome !== "string"
    || typeof payload.assessmentId !== "string"
  ) {
    throw new ContinuationError({
      code: "invalid_response",
      message: "assessment response does not match the published contract",
      recovery: recovery("stop", "Do not prepare from an assessment response that is not provisional and checkout-free."),
    });
  }
  const outcome = assessment.outcome;
  const terminal = TERMINAL_OUTCOMES.has(outcome) || !CLAIMABLE_OUTCOMES.has(outcome);
  record.taskFingerprint = sha256Json(input);
  record.assessment = {
    id: payload.assessmentId,
    outcome,
    terminal,
    summary: typeof assessment.summary === "string" ? assessment.summary : null,
    unknowns: unknownsFor(input, assessment),
    nextSteps: Array.isArray(assessment.nextSteps) ? assessment.nextSteps : [],
    createsCheckout: false,
    decisionBound: payload.decisionBound === true,
    actionableAuthorized: payload.actionableAuthorized === true,
  };
  record.phase = "assessed";
  record.assessmentExpired = false;
  record.nextAction = nextActionFor(record);
}

function preparePayloadOk(record, payload) {
  if (
    payload?.filingAuthorization !== false
    || payload.deploymentStatus !== "available"
    || payload.complete !== true
    || payload.status !== "provisional"
    || typeof payload.applicationId !== "string"
    || typeof payload.recovered !== "boolean"
    || (payload.reconciled !== "created" && payload.reconciled !== "same_operation_recover")
  ) {
    return false;
  }
  const review = sameOriginLink(payload.reviewUrl, record.linkOrigin, payload.applicationId);
  const claim = sameOriginLink(payload.claimUrl, record.linkOrigin, payload.applicationId, { claim: true });
  if (!review || !claim || claim.searchParams.get("claim") !== payload.claimToken) return false;
  return { review, claim };
}

function rememberPrepare(record, payload, checked) {
  if (record.applicationId && record.applicationId !== payload.applicationId) {
    throw new ContinuationError({
      code: "identity_changed",
      message: "Replay returned a different application id.",
      recovery: recovery("stop", "Do not replace the stored application. Reconcile this operation id before any other prepare."),
    });
  }
  record.applicationId = payload.applicationId;
  record.reviewUrl = checked.review.href;
  record.claimUrl = checked.claim.href;
  record.server = {
    recovered: payload.recovered,
    reconciled: payload.reconciled,
    filingAuthorization: false,
    authorizedState: payload.authorizedState ?? null,
    actionableAuthorized: payload.actionableAuthorized === true,
    decisionBound: payload.decisionBound === true,
    deploymentStatus: payload.deploymentStatus,
  };
  record.status = null;
  record.uncertain = null;
  record.phase = "awaiting_human_claim";
  record.nextAction = nextActionFor(record);
}

function reconcileStatus(record, payload) {
  const status = payload?.status;
  if (
    payload?.deploymentStatus !== "available"
    || !status
    || status.applicationId !== record.applicationId
    || status.filingAuthorization !== false
    || typeof status.einIssued !== "boolean"
  ) {
    throw new ContinuationError({
      code: "invalid_response",
      message: "status response does not match the published contract",
      recovery: recovery("retry_read", "Read status again. Do not mark the case complete from an unreadable response."),
    });
  }
  if (!APPLICATION_STATUSES.has(status.status)) {
    throw new ContinuationError({
      code: "unsupported_state",
      message: "application status is not a state this client can reconcile",
      recovery: recovery(
        "human_reviews_existing_case",
        "Do not invent a transition, a cancel, or a completion. The human reviews the stored case. This client will not prepare another one.",
      ),
    });
  }
  const paid = status.status === "paid" || status.status === "async_pending";
  const complete = status.status === "paid" && status.einIssued === true && status.nextAction == null;
  record.status = {
    applicationStatus: status.status,
    nextAction: status.nextAction ?? null,
    fulfillmentStatus: status.fulfillmentStatus ?? null,
    einIssued: status.einIssued,
    paid,
    complete,
    actionableAuthorized: status.actionableAuthorized === true,
    authorizedState: status.authorizedState ?? null,
  };
  if (complete) record.phase = "fulfilled";
  else if (status.status === "paid") record.phase = "paid_not_issued";
  else if (status.status === "async_pending") record.phase = "payment_pending";
  else if (status.status === "async_failed") record.phase = "payment_failed";
  else if (status.status === "claimed" || status.status === "quoted") record.phase = "awaiting_operator";
  else record.phase = "awaiting_human_claim";
  record.nextAction = nextActionFor(record);
}

async function replayPrepare(identity, record, transport) {
  const email = recipient(identity, record, { required: true });
  record.intendedEmail = email;
  const body = record.prepareBody ?? {
    assessmentId: record.assessment.id,
    intendedEmail: email,
    operationId: record.operationId,
  };
  if (
    body.assessmentId !== record.assessment?.id
    || body.operationId !== record.operationId
    || body.intendedEmail !== email
  ) {
    throw new ContinuationError({
      code: "task_mismatch",
      message: "Stored prepare body does not match this task.",
      recovery: recovery("stop", "Do not send a different assessment, recipient, or operation id."),
    });
  }
  record.prepareBody = body;
  record.declaredTransport = identity.transport;
  record.catalogTransport = identity.catalogTransport;
  persist(identity, record);
  const route = record.catalog.routes.prepare;
  try {
    const response = await transport.request("POST", route, {
      body,
      success: [201],
      mutation: true,
    });
    const checked = preparePayloadOk(record, response.payload);
    if (!checked) {
      record.phase = "prepare_uncertain";
      record.nextAction = nextActionFor(record);
      persist(identity, record);
      throw new ContinuationError({
        code: "prepare_uncertain",
        message: "Prepare response did not match the bound claim contract.",
        recovery: recovery(
          "replay_same_bound_prepare",
          "Replay resume once. Do not mint a new operation id and do not treat the response as payment.",
        ),
      });
    }
    rememberPrepare(record, response.payload, checked);
    persist(identity, record);
    return response.payload;
  } catch (error) {
    if (!(error instanceof ContinuationError)) throw error;
    if (error.code === "unknown_outcome" || error.code === "timeout") {
      record.phase = "prepare_uncertain";
      record.declaredTransport = identity.transport;
      record.catalogTransport = identity.catalogTransport;
      record.uncertain = {
        cause: typeof error.causeCode === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(error.causeCode)
          ? error.causeCode
          : "protocol_error",
        operationId: record.operationId,
        assessmentId: record.assessment?.id ?? null,
      };
      record.nextAction = nextActionFor(record);
      persist(identity, record);
      throw new ContinuationError({
        code: "prepare_uncertain",
        causeCode: error.causeCode,
        message: error.message,
        recovery: recovery(
          "replay_same_bound_prepare",
          "Run resume with the same continuation file, task, caller key, and recipient. Do not choose a new operation id.",
        ),
      });
    }
    if (error.code === "assessment_expired" && !record.applicationId) {
      // The server proved no fresh application was created. Explicit reassessment
      // may replace this expired assessment, retaining the same operation id.
      record.prepareBody = null;
      record.uncertain = null;
      record.assessmentExpired = true;
      record.phase = "assessed";
      record.nextAction = {
        kind: "explicit_reassess",
        instruction: "The stored assessment expired before a case existed. Reassess explicitly. Do not invent a new operation id.",
      };
      persist(identity, record);
    }
    if (error.code === "assessment_already_bound" && record.applicationId) {
      record.phase = "awaiting_operator";
      record.nextAction = {
        kind: "status_when_granted",
        instruction:
          "The server kept the existing case and did not return a new claim token. A human issues a status grant. Do not prepare again.",
      };
      persist(identity, record);
    }
    throw error;
  }
}

async function withSession(options, command, run) {
  options = { ...options, budget: commandBudget(envOf(options)) };
  const identity = loadIdentity(options);
  const record = bindRecord(identity, readContinuation(identity.file)) ?? blankRecord(identity);
  if (command !== "discover") refuseCancelled(record);
  const libs = await options.budget.run(() => publicClient());
  const transport = await options.budget.run(() => transportFor(identity, options));
  if (transport.origin !== identity.apiOrigin) {
    throw new ContinuationError({
      code: "origin_mismatch",
      message: "API origin was not accepted.",
      recovery: recovery("fix_input", "Set EIN_ACTIVATION_BASE_URL to an https origin, or http loopback for disposable QA."),
    });
  }
  return run({ identity, record, transport, libs, budget: options.budget });
}

function contractNote(identity, transport, discovery) {
  return {
    operation: transport?.kind ?? identity.transport,
    catalog: transport?.catalogSource ?? null,
    openapi: transport?.openapiSource ?? null,
    cachedOfferUsed: false,
    offerSource: discovery ? "current_catalog" : "stored_record",
    requests: transport?.stats?.requests ?? null,
    latencyMs: transport?.stats?.latencyMs ?? null,
  };
}

function finish(command, identity, record, discovery, extra = {}) {
  record.nextAction = extra.nextAction ?? nextActionFor(record);
  if (extra.transport) {
    record.declaredTransport = extra.transport.kind;
    record.catalogTransport = identity.catalogTransport;
    record.contract = {
      operation: extra.transport.kind,
      catalog: extra.transport.catalogSource,
      openapi: extra.transport.openapiSource,
    };
  }
  if (record.phase !== "new") persist(identity, record);
  return {
    exitCode: extra.exitCode ?? 0,
    view: publicView(record.phase === "new" ? null : record, discovery, {
      command,
      nextAction: record.nextAction,
      public: {
        ...(extra.public ?? {}),
        contract: contractNote(identity, extra.transport, discovery),
      },
    }, { showClaimUrl: identity.showClaimUrl }),
    record,
  };
}

export async function executeCommand(command, options = {}) {
  if (command === "help") return { exitCode: 0, help: true };
  if (command === "discover") {
    return withSession(options, command, async ({ identity, record, transport }) => {
      refuseCancelled(record);
      const live = await discoverLive(identity, transport);
      commitCatalog(identity, record, live, catalogLocked(record));
      if (record.phase === "new") record.phase = "discovered";
      record.nextAction = nextActionFor(record);
      return finish(command, identity, record, live.discovery, { transport });
    });
  }
  if (command === "assess") {
    return withSession(options, command, async ({ identity, record, transport, libs, budget }) => {
      const input = await budget.run(() => readTask(options, libs.client), { stdin: options.stdin ?? process.stdin });
      const fingerprint = sha256Json(input);
      if (record.taskFingerprint && record.taskFingerprint !== fingerprint) {
        throw new ContinuationError({ code: "task_payload_mismatch", message: "This task already has different supplied facts.",
          recovery: recovery("stop", "Use a separate task id and continuation file for a changed task.") });
      }
      if (identity.reassess && record.prepareBody) {
        throw new ContinuationError({ code: "task_mismatch", message: "A dispatched prepare owns this assessment and body.",
          recovery: recovery("replay_same_bound_prepare", "Resume the existing operation. Do not replace its assessment.") });
      }
      const live = await discoverLive(identity, transport);
      commitCatalog(identity, record, live, catalogLocked(record));
      if (record.assessment && record.taskFingerprint === fingerprint && !identity.reassess) {
        record.nextAction = nextActionFor(record);
        return finish(command, identity, record, live.discovery, { transport });
      }
      if (record.assessment && record.taskFingerprint !== fingerprint) {
        throw new ContinuationError({
          code: "task_payload_mismatch",
          message: "This task id already has different operator facts.",
          recovery: recovery("stop", "Do not assess a second company into this task. Use a new task id and a new continuation file."),
        });
      }
      if (record.applicationId) {
        throw new ContinuationError({
          code: "task_mismatch",
          message: "This task already has an application. Reassess would not replay it.",
          recovery: recovery("status_when_granted", "Read status or hand the existing claim link to the human. Do not create another assessment for this task."),
        });
      }
      if (record.phase === "assess_uncertain" && !identity.reassess) {
        throw new ContinuationError({
          code: "assess_uncertain",
          message: "A previous assess reply was lost.",
          recovery: recovery(
            "explicit_reassess",
            "Set EIN_CONTINUATION_REASSESS=1 to assess again. That may store another assessment row. Do not prepare until an assessment id is stored.",
          ),
        });
      }
      const path = live.routes.assess_formation_need.path;
      try {
        const response = await transport.request("POST", path, { body: input, success: [200], mutation: true });
        applyAssessment(record, input, response.payload);
      } catch (error) {
        if (error instanceof ContinuationError && (error.code === "unknown_outcome" || error.code === "timeout")) {
          record.phase = "assess_uncertain";
          record.taskFingerprint = fingerprint;
          record.nextAction = nextActionFor(record);
          persist(identity, record);
          throw new ContinuationError({
            code: "assess_uncertain",
            message: "Assess reply was not received. It was not retried.",
            recovery: recovery(
              "explicit_reassess",
              "Do not assume an outcome. Set EIN_CONTINUATION_REASSESS=1 to send the same facts again. Do not prepare.",
            ),
          });
        }
        throw error;
      }
      persist(identity, record);
      return finish(command, identity, record, live.discovery, { transport });
    });
  }
  if (command === "prepare" || command === "resume") {
    return withSession(options, command, async ({ identity, record, transport }) => {
      if (record.declaredTransport && record.declaredTransport !== identity.transport) {
        throw new ContinuationError({
          code: "transport_mismatch",
          message: "This task is bound to a different declared transport.",
          recovery: recovery(
            "stop",
            "Resume with the stored transport. Do not send this prepare on another transport and do not mint an operation id.",
          ),
        });
      }
      if (record.catalogTransport && record.catalogTransport !== identity.catalogTransport) {
        throw new ContinuationError({
          code: "transport_mismatch",
          message: "This task is bound to a different catalog transport.",
          recovery: recovery(
            "stop",
            "Resume with the stored catalog transport. Do not send this prepare and do not mint an operation id.",
          ),
        });
      }
      const live = await discoverLive(identity, transport);
      commitCatalog(identity, record, live, catalogLocked(record) || command === "prepare");
      if (!record.assessment) {
        throw new ContinuationError({
          code: "not_assessed",
          message: "Prepare requires an assessment stored for this task.",
          recovery: recovery("assess", "Run assess with the explicit task. Do not invent facts."),
        });
      }
      if (record.assessment.terminal || !CLAIMABLE_OUTCOMES.has(record.assessment.outcome)) {
        throw new ContinuationError({
          code: "prepare_refused",
          message: `Refusing to prepare a ${record.assessment.outcome} outcome.`,
          recovery: recovery("stop", "Terminal and unknown outcomes stay unresolved. Do not prepare, claim, or pay."),
        });
      }
      recipient(identity, record, { required: false });
      if (command === "resume" && record.phase !== "prepare_uncertain" && record.applicationId) {
        return finish(command, identity, record, live.discovery, { transport });
      }
      await replayPrepare(identity, record, transport);
      return finish(command, identity, record, live.discovery, { transport });
    });
  }
  if (command === "status") {
    return withSession(options, command, async ({ identity, record, transport, libs }) => {
      if (!record.applicationId) {
        throw new ContinuationError({
          code: "not_prepared",
          message: "This task has no application to read.",
          recovery: recovery(
            record?.assessment?.terminal ? "stop" : "prepare_for_human_claim",
            record?.assessment?.terminal
              ? "The assessment is terminal. Do not prepare."
              : "Prepare this task first, or stop if the assessment was terminal.",
          ),
        });
      }
      const live = await discoverLive(identity, transport);
      commitCatalog(identity, record, live, true);
      const grantEnv = identity.env.EIN_AGENT_GRANT;
      const grantFile = identity.env.EIN_AGENT_GRANT_FILE;
      const hasGrant = (typeof grantEnv === "string" && grantEnv.trim().length > 0)
        || (typeof grantFile === "string" && grantFile.trim().length > 0);
      if (!hasGrant) {
        throw missingStatusGrant(record);
      }
      let grant;
      try {
        grant = libs.grant.loadGrantToken({
          env: identity.env,
          required: true,
          origin: identity.apiOrigin,
        });
      } catch (error) {
        const foreign = error instanceof Error && /must exactly match/.test(error.message);
        if (!foreign) throw missingStatusGrant(record);
        throw new ContinuationError({
          code: foreign ? "foreign_credential" : "missing_grant",
          status: 401,
          message: foreign
            ? "Grant origin does not match this API origin."
            : "A human-issued status grant is required.",
          recovery: recovery(
            foreign ? "use_recorded_origin" : "human_issues_grant",
            foreign
              ? "Set EIN_AGENT_GRANT_ORIGIN to the API origin in EIN_ACTIVATION_BASE_URL. Do not send the grant to another origin and do not log in again to bypass it."
              : "The human issues a revocable status grant for this application. This client does not mint one, claim, or pay.",
          ),
        });
      }
      const path = record.catalog.routes.status.replaceAll("{applicationId}", encodeURIComponent(record.applicationId));
      if (path.includes("{") || path !== live.routes.get_application_status.path.replaceAll("{applicationId}", encodeURIComponent(record.applicationId))) {
        throw new ContinuationError({
          code: "contract_mismatch",
          message: "Stored status route does not match the current catalog.",
          recovery: recovery("stop", "Do not call a status path that the current catalog did not publish."),
        });
      }
      try {
        const response = await transport.request("GET", path, {
          grantToken: grant,
          success: [200],
          secrets: [grant],
        });
        reconcileStatus(record, response.payload);
      } catch (error) {
        if (error instanceof ContinuationError && (error.code === "invalid_grant" || error.status === 401)) {
          throw new ContinuationError({
            code: "grant_rejected",
            status: 401,
            message: "The status grant was rejected as invalid, expired, revoked, or foreign.",
            recovery: recovery(
              "human_reissues_grant",
              "A human issues a new grant for this same application. Do not claim, pay, or start another task.",
            ),
          });
        }
        if (error instanceof ContinuationError && (error.code === "insufficient_scope" || error.status === 403)) {
          throw new ContinuationError({
            code: "foreign_grant",
            status: 403,
            message: "This grant is not scoped to this task's application.",
            recovery: recovery(
              "stop",
              "Refuse the other customer or task. Do not reuse their grant and do not prepare a replacement case.",
            ),
          });
        }
        throw error;
      }
      persist(identity, record);
      return finish(command, identity, record, live.discovery, { transport });
    });
  }
  if (command === "cancel") {
    const identity = loadIdentity(options);
    const existing = readContinuation(identity.file);
    const record = bindRecord(identity, existing);
    if (!record) {
      throw new ContinuationError({
        code: "not_prepared",
        message: "There is no caller record to cancel.",
        recovery: recovery("stop", "Do not call a server cancel. This API has no agent cancel for the case."),
      });
    }
    if (record.phase !== "cancelled") {
      record.phase = "cancelled";
      record.cancelledAt = new Date().toISOString();
      record.nextAction = nextActionFor(record);
      persist(identity, record);
    }
    return finish(command, identity, record, null, {
      public: {
        serverCaseCancelled: false,
        note: "Local caller record only. Grant expiry and human grant revoke are the server operations. This client did not cancel the application.",
      },
    });
  }
  if (command === "show") {
    const identity = loadIdentity(options);
    const record = bindRecord(identity, readContinuation(identity.file));
    if (!record) {
      throw new ContinuationError({
        code: "continuation_absent",
        message: "No continuation file is stored at EIN_CONTINUATION_FILE.",
        recovery: recovery("discover", "Run discover to store a caller record. Do not pass the record on argv."),
      });
    }
    return {
      exitCode: 0,
      view: publicView(record, null, { command, nextAction: nextActionFor(record) }, { showClaimUrl: identity.showClaimUrl }),
      record,
    };
  }
  throw new ContinuationError({
    code: "invalid_input",
    message: `unknown command ${command}`,
    recovery: recovery("fix_input", "Use help, discover, assess, prepare, resume, status, show, or cancel."),
  });
}
