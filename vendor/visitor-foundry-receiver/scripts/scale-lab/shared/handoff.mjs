/**
 * Portable Scale handoff packet.
 *
 * Links S02 work-board briefs, S03 town-square evidence, and S04 capability
 * selection through the existing correspondence event kinds and task-memory
 * observations — without a second identity, completion, or payment store.
 *
 * Packet is local/demo JSON only. It does not custody funds or claim hosted APIs.
 */

import { EVENT_KINDS, isCorrespondenceKind } from "./correspondence-kinds.mjs";
import {
  CONTACT_EMAIL,
  CORRESPONDENCE_PATH,
  LAB_PATHS,
  TASK_SQUARE_PATH,
} from "./paths.mjs";

export const HANDOFF_SCHEMA = "neomorphic.scale-handoff.v1";

function clone(value) {
  return structuredClone(value);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

/**
 * Build a correspondence-shaped event projection from a work-board job dossier.
 * Standalone utility: produce/export a brief for the existing desk.
 */
export function briefFromWorkBoardDossier(dossier, { agentId = "local-operator" } = {}) {
  const d = requireObject(dossier, "dossier");
  const job = requireObject(d.job, "dossier.job");
  const text = [
    `Work-board brief: ${job.title || job.id}`,
    `fundingClass=${job.fundingClass}`,
    `status=${job.status}`,
    job.brief || job.summary || "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    schema: HANDOFF_SCHEMA,
    kind: EVENT_KINDS.request,
    surface: "work-board",
    projectHint: job.correspondenceProjectHint || `work-board:${job.id}`,
    agentId,
    jobId: job.id,
    fundingClass: job.fundingClass,
    fundingHonesty: d.fundingHonesty || null,
    text,
    artifact: null,
    routes: {
      workBoard: LAB_PATHS.workBoard,
      correspondence: CORRESPONDENCE_PATH,
      taskSquare: TASK_SQUARE_PATH,
    },
    contactEmail: CONTACT_EMAIL,
    hostedApi: false,
    funded: false,
    note: "Local brief export. Unfunded/demonstration rows stay labelled. Use /correspondence/ for human review.",
  };
}

/**
 * Attach a task-memory observation for town-square inspect/correct.
 * Does not invent a second observation schema — caller supplies contract-valid JSON.
 */
export function evidencePacketFromObservation(observation, { trust = "supplied-unverified" } = {}) {
  const obs = requireObject(observation, "observation");
  return {
    schema: HANDOFF_SCHEMA,
    kind: EVENT_KINDS.artifact,
    surface: "town-square",
    trust,
    observation: clone(obs),
    routes: {
      townSquare: LAB_PATHS.townSquare,
      taskSquare: TASK_SQUARE_PATH,
      correspondence: CORRESPONDENCE_PATH,
    },
    hostedApi: false,
    note: "Observation is data only. Import via town-square or /labs/task-square/. Never execute payload fields.",
  };
}

/**
 * Record a capability selection as a correspondence-shaped artifact handoff.
 * Standalone utility: select a usable capability by supplied input.
 * Accepts matchCapabilities() result ({ matches, rejected, empty, refusal }).
 */
export function selectionFromCapabilityMatch(matchResult, { requestedOutcome = null, inputs = null } = {}) {
  const result = requireObject(matchResult, "matchResult");
  const top = Array.isArray(result.matches) && result.matches.length > 0 ? result.matches[0] : null;
  const selected = top?.capability || result.selected || result.capability || null;
  if (!selected || result.empty) {
    return {
      schema: HANDOFF_SCHEMA,
      kind: EVENT_KINDS.needs_human,
      surface: "capability-market",
      ok: false,
      refusal: result.refusal || result.refusals || "no_result",
      rejectedCount: Array.isArray(result.rejected) ? result.rejected.length : 0,
      requestedOutcome,
      inputs: inputs ? clone(inputs) : null,
      routes: {
        capabilities: LAB_PATHS.capabilities,
        correspondence: CORRESPONDENCE_PATH,
      },
      hostedApi: false,
      funded: false,
      note: "No selectable capability. Honest refusal; no invented seller or price.",
    };
  }

  const completion = selected.completionLink || null;
  return {
    schema: HANDOFF_SCHEMA,
    kind: EVENT_KINDS.artifact,
    surface: "capability-market",
    ok: true,
    capabilityId: selected.id,
    sellerClass: selected.seller?.class || selected.sellerClass || null,
    price: selected.price || null,
    stale: Boolean(top?.stale),
    runnable: Boolean(top?.runnable),
    routeKind: selected.executionRoute?.kind || selected.routeKind || null,
    completionLink: completion,
    requestedOutcome,
    inputs: inputs ? clone(inputs) : null,
    artifact: completion?.href
      ? { url: completion.href, label: completion.label || selected.id }
      : null,
    text: `Selected capability ${selected.id} for outcome ${requestedOutcome || "(unspecified)"}`,
    routes: {
      capabilities: LAB_PATHS.capabilities,
      correspondence: CORRESPONDENCE_PATH,
      workBoard: LAB_PATHS.workBoard,
      townSquare: LAB_PATHS.townSquare,
    },
    contactEmail: CONTACT_EMAIL,
    hostedApi: false,
    funded: false,
    note: "Selection is local/demo. Declared prices are not custody. Complete via link or correspondence desk.",
  };
}

/**
 * Compose an end-to-end Scale packet: brief → evidence → capability selection.
 * One identity envelope; experiments remain independently useful.
 */
export function composeScalePacket({ brief = null, evidence = null, selection = null } = {}) {
  const events = [];
  for (const part of [brief, evidence, selection]) {
    if (!part) continue;
    if (!isCorrespondenceKind(part.kind)) {
      throw new Error(`invalid correspondence kind: ${part.kind}`);
    }
    events.push(clone(part));
  }
  return {
    schema: HANDOFF_SCHEMA,
    composedAt: new Date().toISOString(),
    correspondencePath: CORRESPONDENCE_PATH,
    contactEmail: CONTACT_EMAIL,
    taskSquarePath: TASK_SQUARE_PATH,
    labPaths: { ...LAB_PATHS },
    hostedApi: false,
    paymentAuthority: "unchanged-owner-rails-only",
    events,
    note: "Integration candidate packet. Not acceptance of S02/S03/S04 inputs as published product.",
  };
}

export { EVENT_KINDS, CONTACT_EMAIL, CORRESPONDENCE_PATH, LAB_PATHS, TASK_SQUARE_PATH };
