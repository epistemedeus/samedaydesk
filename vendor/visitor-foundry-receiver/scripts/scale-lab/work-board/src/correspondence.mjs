/**
 * Project work-board ledger events onto the existing correspondence service.
 * Create / update / observe use the accepted HTTP API. No second store,
 * custody, escrow, or hosted marketplace.
 */

import {
  CorrespondenceClient,
  assertCorrespondenceOrigin,
  createIdempotencyKey,
} from "../../../../scripts/correspondence/client.mjs";
import {
  MAX_EVENT_TEXT_CHARS,
  MAX_LABEL_CHARS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
} from "../../../../scripts/correspondence/constants.mjs";
import { createWorkBoard } from "./board.mjs";
import { ADAPTER_MODE_LOCAL_DEMO, ERROR_CODES, EVENT_KINDS, FUNDING_CLASS } from "./constants.mjs";
import { boardError } from "./validate.mjs";

const SERVICE_KINDS = new Set(Object.values(EVENT_KINDS));
const ARTIFACT_URL = "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json";

export function clip(value, max) {
  const text = value == null ? "" : String(value);
  return text.length <= max ? text : text.slice(0, max);
}

export function demonstrationCreateJobInput(overrides = {}) {
  return {
    id: "job_n12_create_observe",
    title: "DEMONSTRATION: Create, update, and observe a work-board row",
    brief:
      "Demonstration only (unfunded). Create a labelled job, submit a proposal and completion artifact, then post a correction. Observe the ledger. Not a hosted award or escrow.",
    deliverableContract:
      "Return a JSON note with sourceUrl (https), observedAt (ISO-8601), and a statement that fundingClass=demonstration. No payment authorization. No escrow.",
    acceptanceEvidence: [
      "Job title or label names demonstration",
      "Proposal, completion, and correction appear as correspondence kinds",
      "Observe returns the same event kinds posted",
    ],
    fundingClass: FUNDING_CLASS.demonstration,
    label: "demonstration · unfunded · fictional",
    idempotencyKey: "n12-create-job",
    ...overrides,
  };
}

/**
 * Map a board ledger event onto a correspondence POST /events body.
 * Board-local fields such as digest are not correspondence fields.
 */
export function boardEventToCorrespondenceBody(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw boardError(ERROR_CODES.invalid_input, "event must be an object");
  }
  const kind = event.kind;
  if (!SERVICE_KINDS.has(kind)) {
    throw boardError(ERROR_CODES.invalid_input, `unsupported event kind: ${kind}`);
  }
  const body = { kind };
  if (event.text != null && String(event.text).trim()) {
    body.text = clip(String(event.text).trim(), MAX_EVENT_TEXT_CHARS);
  }
  if (event.artifact) {
    if (!event.artifact.url) {
      throw boardError(ERROR_CODES.invalid_artifact, "artifact.url is required");
    }
    body.artifact = { url: event.artifact.url };
    if (event.artifact.label != null) {
      body.artifact.label = clip(event.artifact.label, MAX_LABEL_CHARS);
    }
  }
  if (kind === EVENT_KINDS.artifact && !body.artifact) {
    throw boardError(ERROR_CODES.missing_artifact, "artifact events require artifact");
  }
  if (kind !== EVENT_KINDS.artifact && !body.text) {
    throw boardError(ERROR_CODES.invalid_input, `${kind} events require text`);
  }
  return body;
}

export function projectBodyFromJob(job) {
  if (!job || typeof job !== "object") {
    throw boardError(ERROR_CODES.invalid_input, "job must be an object");
  }
  return {
    title: clip(job.title, MAX_TITLE_CHARS),
    summary: clip(
      [`work-board job ${job.id}`, `fundingClass=${job.fundingClass}`, job.brief || ""].join("\n"),
      MAX_SUMMARY_CHARS,
    ),
  };
}

function publicResult(result) {
  return {
    schema: "neomorphic.work-board.journey.v1",
    boardMode: result.boardMode,
    correspondenceBound: result.correspondenceBound,
    hostedApi: false,
    funded: false,
    jobId: result.job.id,
    jobStatus: result.job.status,
    fundingClass: result.job.fundingClass,
    projectId: result.projectId,
    localEventKinds: result.localEvents.map((event) => event.kind),
    localEventIds: result.localEvents.map((event) => event.id),
    serviceEventKinds: result.serviceEvents ? result.serviceEvents.map((event) => event.kind) : null,
    serviceEventIds: result.serviceEvents ? result.serviceEvents.map((event) => event.id) : null,
    replayedSameId: result.replayedSameId,
    observedCount: result.observedCount,
    handoff: result.handoff,
    note: result.note,
  };
}

function runLocalJourney(board, jobInput) {
  const created = board.createJob(jobInput);
  const proposal = board.submitProposal({
    jobId: created.job.id,
    agentId: "agent_n12",
    summary: "N12 proposal: bounded demonstration note. Unfunded.",
    expectedVersion: created.job.version,
    idempotencyKey: "n12-propose",
  });
  const completion = board.submitCompletion({
    jobId: created.job.id,
    agentId: "agent_n12",
    proposalId: proposal.proposal.id,
    artifact: {
      url: ARTIFACT_URL,
      label: "N12 demonstration completion artifact",
      digest: "sha256:n12-demo",
    },
    evidenceNotes: ["fundingClass=demonstration", "hostedApi=false"],
    expectedVersion: proposal.job.version,
    idempotencyKey: "n12-complete",
  });
  const correction = board.submitCorrection({
    jobId: created.job.id,
    agentId: "agent_n12",
    correctsCompletionId: completion.completion.id,
    text: "CORRECTION: prior completion is demonstration-class only; do not treat as a customer delivery.",
    expectedVersion: completion.job.version,
    idempotencyKey: "n12-correct",
  });
  const localEvents = board.listEvents({ jobId: created.job.id });
  return { created, proposal, completion, correction, localEvents, job: board.getJob(created.job.id) };
}

/**
 * Create a job, update it (proposal → artifact → correction), observe the ledger.
 * When baseUrl+adminToken are supplied, the same events are posted to correspondence
 * and observed back over HTTP. Tokens are never returned.
 */
export async function runWorkBoardJourney({
  baseUrl = null,
  adminToken = null,
  fetchImpl = globalThis.fetch,
  clock,
  seed,
  job = null,
  bootstrapIdempotencyKey = null,
} = {}) {
  const board = createWorkBoard({ seed, clock });
  const jobInput = demonstrationCreateJobInput(job || {});
  const local = runLocalJourney(board, jobInput);
  const handoff = board.getHandoff();

  if (!baseUrl) {
    return publicResult({
      boardMode: ADAPTER_MODE_LOCAL_DEMO,
      correspondenceBound: false,
      job: local.job,
      projectId: null,
      localEvents: local.localEvents,
      serviceEvents: null,
      replayedSameId: null,
      observedCount: local.localEvents.length,
      handoff,
      note: "Local fixture journey. Correspondence was not bound. Not a hosted API.",
    });
  }

  if (!adminToken) {
    throw boardError(ERROR_CODES.invalid_input, "adminToken is required to bind correspondence");
  }

  const origin = assertCorrespondenceOrigin(baseUrl);
  const bootstrap = new CorrespondenceClient({
    baseUrl: origin,
    fetch: fetchImpl,
    token: adminToken,
  });

  let owner = null;
  try {
    const projectBody = projectBodyFromJob(local.job);
    const createdProject = await bootstrap.createProject({
      idempotencyKey: bootstrapIdempotencyKey || createIdempotencyKey(),
      token: adminToken,
      ...projectBody,
    });
    const ownerToken = createdProject.ownerToken;
    const projectId = createdProject.project.id;
    owner = new CorrespondenceClient({
      baseUrl: origin,
      fetch: fetchImpl,
      token: ownerToken,
    });

    const posted = [];
    for (const event of local.localEvents) {
      const body = boardEventToCorrespondenceBody(event);
      const key = `n12-${event.id}-xxxxxxxx`.slice(0, 24);
      const first = await owner.postEvent({
        projectId,
        token: ownerToken,
        idempotencyKey: key,
        ...body,
      });
      posted.push(first);
    }

    const replayBody = boardEventToCorrespondenceBody(local.localEvents[local.localEvents.length - 1]);
    const replayKey = `n12-${local.localEvents[local.localEvents.length - 1].id}-xxxxxxxx`.slice(0, 24);
    const replay = await owner.postEvent({
      projectId,
      token: ownerToken,
      idempotencyKey: replayKey,
      ...replayBody,
    });

    const observed = await owner.listEvents({
      projectId,
      token: ownerToken,
      limit: 50,
    });

    const readback = await owner.getProject({ projectId, token: ownerToken });

    return publicResult({
      boardMode: ADAPTER_MODE_LOCAL_DEMO,
      correspondenceBound: true,
      job: local.job,
      projectId,
      localEvents: local.localEvents,
      serviceEvents: observed.events,
      replayedSameId: replay.event.id === posted[posted.length - 1].event.id && replay.replayed === true,
      observedCount: observed.events.length,
      handoff,
      note: `Bound to correspondence project ${readback.project.id}. Board remains local-demo; service stores events as data. Not custody.`,
    });
  } finally {
    bootstrap.dispose();
    owner?.dispose();
  }
}
