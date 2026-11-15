import { API_SCHEMA, FORBIDDEN_COMMANDS, capabilityStamp } from "./constants.mjs";
import {
  acceptWork,
  claimWork,
  deliverWork,
  postWork,
  projectFeeWork,
  proveWork,
  recoverWork,
  releaseWork,
  selectWork,
  showWork,
} from "./commands.mjs";

const COMMANDS = new Map([
  ["post", postWork],
  ["claim", claimWork],
  ["select", selectWork],
  ["deliver", deliverWork],
  ["accept", acceptWork],
  ["proof", proveWork],
  ["project-fee", projectFeeWork],
  ["release", releaseWork],
  ["recover", recoverWork],
  ["show", showWork],
]);

export function handleApi(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { ok: false, reason: "request_invalid", status: 400, ...capabilityStamp() };
  }
  const command = request.command;
  if (typeof command !== "string" || command.length < 1) {
    return { ok: false, reason: "command_required", status: 400, ...capabilityStamp() };
  }
  if (FORBIDDEN_COMMANDS.includes(command)) {
    return { ok: false, reason: "payment_command_refused", status: 403, command, ...capabilityStamp() };
  }
  const handler = COMMANDS.get(command);
  if (!handler) return { ok: false, reason: "command_refused", status: 404, command, ...capabilityStamp() };
  const env = { journeyPath: request.journeyPath, clock: request.clock };
  const input = request.input && typeof request.input === "object" ? { ...request.input } : {};
  if (command === "proof" && request.optIn === true) input.optIn = true;
  if (command === "show") input.public = request.public === true;
  if (command === "recover" || command === "release") {
    if (request.automatic === true) input.automatic = true;
    if (request.explicitRelease === true) input.explicitRelease = true;
    if (request.fencing !== undefined) input.fencing = request.fencing;
    if (request.holderId !== undefined) input.holderId = request.holderId;
  }
  const result = handler(input, env);
  return { ...result, schema: result.schema || API_SCHEMA, status: statusFor(result) };
}

function statusFor(result) {
  if (result.ok) return 200;
  if (["journey_missing", "input_missing"].includes(result.reason)) return 404;
  if (["requester_required", "self_claim_refused", "self_selection_refused", "holder_mismatch", "payment_command_refused"].includes(result.reason)) {
    return 403;
  }
  if (["double_claim", "selection_conflict", "revision_conflict", "retained_lock_refused", "automatic_unlock_refused", "idempotency_conflict", "decision_conflict"].includes(result.reason)) {
    return 409;
  }
  return 400;
}
