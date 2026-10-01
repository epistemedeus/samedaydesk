import { isDeepStrictEqual } from "node:util";
import {
  digest,
  hash,
  iso,
  object,
  ref,
  str,
  validateRequest,
} from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/capabilities/src/contracts.mjs";
import { SCHEMA, exact } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/contract.mjs";
import { RECEIVER_ID } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/profile.mjs";
import { hashRequest } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";

// Database namespace of the correspondence store. It is not an entry,
// contribution-binding, request, or invocation wire schema.
export const DB_NAMESPACE = "pilot_correspondence";

export const ENTRY_SCHEMA = SCHEMA;
export const BINDING_SCHEMA = "neomorphic.foundry.entry-receiver-binding.v1";
export const REQUEST_SCHEMA = "neomorphic.foundry.capability-request.v1";
export const INVOCATION_SCHEMA = "neomorphic.foundry.invocation.v1";

const DESCRIPTOR_KEYS = [
  "schema",
  "profile",
  "availability",
  "remainingEnrollments",
  "receiver",
  "clientContract",
  "nextAction",
];
const PROFILE_KEYS = [
  "schema",
  "profileId",
  "fundingKind",
  "capabilities",
  "excludedAuthority",
  "contributionRequired",
  "identityProofRequired",
  "sharingAuthorized",
  "decline",
  "limits",
  "eventBudget",
  "grantRoles",
  "renewal",
  "independence",
  "originalUse",
  "contribution",
  "termsHash",
];
const LIMIT_KEYS = ["id", "maxEnrollments", "maxEvents", "grantSeconds", "workspaceSeconds"];
const DECLINE_KEYS = ["nextAction", "createsWorkspace"];
const CONTRIBUTION_KEYS = ["standingScopeRequired", "scope", "binding"];
const BINDING_KEYS = [
  "schema",
  "receiverId",
  "hostConfigId",
  "evaluator",
  "environmentDigest",
  "contributionTerms",
  "scope",
  "aggregate",
  "maxPhysical",
  "sharing",
];
const INVOCATION_KEYS = [
  "schema",
  "target",
  "taskId",
  "manifestId",
  "inputDigest",
  "output",
  "invokedAt",
  "outcome",
  "purpose",
  "relationship",
  "cost",
  "effortMs",
  "beneficiaryGrantId",
  "environmentDigest",
  "executionObservation",
];
const TERMS_HASH = /^sha256:[a-f0-9]{64}$/;
const PROFILE_ID = /^vf10:[a-z0-9-]{1,64}$/;

function termsMatch(profile) {
  if (!TERMS_HASH.test(profile?.termsHash || "")) return false;
  const { termsHash, ...rest } = profile;
  return `sha256:${hashRequest(rest)}` === termsHash;
}

export function validateVisitorEntry(body) {
  try {
    exact(body, DESCRIPTOR_KEYS);
    if (body.schema !== ENTRY_SCHEMA || body.clientContract !== ENTRY_SCHEMA) return null;
    if (body.schema === DB_NAMESPACE || body.clientContract === DB_NAMESPACE) return null;
    if (body.availability !== "available" && body.availability !== "exhausted") return null;
    if (!Number.isInteger(body.remainingEnrollments) || body.remainingEnrollments < 0) return null;
    if (typeof body.receiver !== "string" || body.receiver !== RECEIVER_ID) return null;
    if (typeof body.nextAction !== "string" || body.nextAction.length < 1 || body.nextAction.length > 80) return null;
    exact(body.profile, PROFILE_KEYS);
    if (body.profile.schema !== ENTRY_SCHEMA || !PROFILE_ID.test(body.profile.profileId)) return null;
    if (!termsMatch(body.profile)) return null;
    exact(body.profile.limits, LIMIT_KEYS);
    exact(body.profile.decline, DECLINE_KEYS);
    exact(body.profile.contribution, CONTRIBUTION_KEYS);
    if (body.profile.contribution.standingScopeRequired !== true) return null;
    if (body.profile.contribution.scope !== "synthetic-reusable-components") return null;
    const binding = body.profile.contribution.binding;
    exact(binding, BINDING_KEYS);
    if (binding.schema !== BINDING_SCHEMA || binding.schema === DB_NAMESPACE) return null;
    if (binding.receiverId !== RECEIVER_ID || binding.scope !== "synthetic-reusable-components") return null;
    if (!TERMS_HASH.test(binding.contributionTerms)) return null;
    if (!TERMS_HASH.test(binding.environmentDigest) || !TERMS_HASH.test(binding.hostConfigId)) return null;
    if (body.receiver !== binding.receiverId) return null;
    return body;
  } catch {
    return null;
  }
}

export function validateCapabilityRequest(request) {
  try {
    validateRequest(request);
    return request?.schema === REQUEST_SCHEMA && request.schema !== DB_NAMESPACE;
  } catch {
    return false;
  }
}

export function validateInvocationEnvelope(invocation) {
  try {
    object(invocation, INVOCATION_KEYS, "invocation");
    if (invocation.schema !== INVOCATION_SCHEMA || invocation.schema === DB_NAMESPACE) return false;
    ref(invocation.target, "invocation.target");
    str(invocation.taskId, "invocation.taskId", 512);
    digest(invocation.manifestId, "invocation.manifestId");
    digest(invocation.inputDigest, "invocation.inputDigest");
    iso(invocation.invokedAt, "invocation.invokedAt");
    if (invocation.outcome !== "observed_output" || invocation.purpose !== "owner_qa" || invocation.relationship !== "owner") return false;
    if (invocation.cost !== null || invocation.effortMs !== null) return false;
    str(invocation.beneficiaryGrantId, "invocation.beneficiaryGrantId", 512);
    digest(invocation.environmentDigest, "invocation.environmentDigest");
    str(invocation.executionObservation, "invocation.executionObservation", 512);
    return true;
  } catch {
    return false;
  }
}

function sameTarget(left, right) {
  if (!left || !right) return false;
  try {
    ref(left, "target");
    ref(right, "target");
  } catch {
    return false;
  }
  return isDeepStrictEqual(
    { capabilityId: left.capabilityId, version: left.version, contentId: left.contentId },
    { capabilityId: right.capabilityId, version: right.version, contentId: right.contentId },
  );
}

export function invocationMatchesRequest(invocation, request) {
  if (!validateInvocationEnvelope(invocation) || !validateCapabilityRequest(request)) return false;
  return invocation.taskId === request.taskId && invocation.inputDigest === hash(request.input);
}

// Identity comes from the caller-supplied canonical readback. Equal output is not a binding.
export function invocationSelectsCandidate(readback, request, contributedCandidateId) {
  if (!readback || typeof readback !== "object" || typeof contributedCandidateId !== "string" || !contributedCandidateId) {
    return false;
  }
  const contributed = readback.contributed;
  if (!contributed || contributed.candidateId !== contributedCandidateId) return false;
  if (!Number.isInteger(contributed.generation) || contributed.generation < 1) return false;
  if (!invocationMatchesRequest(readback.invocation, request)) return false;
  if (readback.executionCandidateId !== contributed.candidateId) return false;
  if (readback.executionGeneration !== contributed.generation) return false;
  if (!sameTarget(readback.invocation.target, readback.executionTarget)) return false;
  if (!sameTarget(readback.invocation.target, readback.manifestTarget)) return false;
  if (!sameTarget(readback.invocation.target, contributed.target)) return false;
  if (readback.invocation.target.contentId !== contributed.contentId) return false;
  if (readback.invocation.manifestId !== readback.manifestId) return false;
  if (readback.taskId !== request.taskId) return false;
  if (readback.inputDigest !== hash(request.input)) return false;
  if (readback.requestDigest !== hash(request) || readback.manifestRequestId !== hash(request)) return false;
  return true;
}
