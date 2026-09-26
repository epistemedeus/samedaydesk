/**
 * In-memory work/bounty board.
 *
 * Journey: brief → deliverable contract → acceptance evidence → proposal →
 * completion artifact → correction. Maps ledger rows onto correspondence
 * event kinds (request/reply/artifact/correction) without inventing a second
 * protocol or any custody/escrow layer.
 */

import {
  ADAPTER_MODE_LOCAL_DEMO,
  CONTACT_EMAIL,
  CORRESPONDENCE_PATH,
  ERROR_CODES,
  EVENT_KINDS,
  FUNDING_CLASS,
  JOB_STATUS,
  PROPOSAL_STATUS,
  SCHEMA,
} from "./constants.mjs";
import { createSeedBoard } from "./fixture.mjs";
import {
  boardError,
  clone,
  requireId,
  requireString,
  requireVersion,
  validateArtifact,
  validateJobRecord,
} from "./validate.mjs";

function hashKey(parts) {
  // Stable non-crypto fingerprint for idempotency request matching in demos.
  const raw = JSON.stringify(parts);
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

export class WorkBoard {
  constructor(seed = createSeedBoard(), { clock = () => Date.now() } = {}) {
    this.mode = ADAPTER_MODE_LOCAL_DEMO;
    this.schema = SCHEMA;
    this._clock = clock;
    this._state = this._hydrate(seed);
    this._idempotency = new Map();
    this._seq = this._state.events.length;
  }

  _hydrate(seed) {
    const base = clone(seed);
    base.jobs = (base.jobs || []).map((job) => validateJobRecord(job));
    base.proposals = Array.isArray(base.proposals) ? base.proposals.map(clone) : [];
    base.completions = Array.isArray(base.completions) ? base.completions.map(clone) : [];
    base.corrections = Array.isArray(base.corrections) ? base.corrections.map(clone) : [];
    base.events = Array.isArray(base.events) ? base.events.map(clone) : [];
    return base;
  }

  getDisclaimer() {
    return this._state.disclaimer;
  }

  getHandoff() {
    return {
      correspondencePath: CORRESPONDENCE_PATH,
      contactEmail: CONTACT_EMAIL,
      mailto: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Work-board handoff (human review)")}`,
      note: "Live contact stays on the existing correspondence desk. This board stores local fixtures only; it does not custody funds or host awards.",
    };
  }

  exportSnapshot() {
    return {
      schema: SCHEMA,
      mode: this.mode,
      label: this._state.label,
      disclaimer: this._state.disclaimer,
      exportedAt: nowIso(this._clock),
      board: clone(this._state),
    };
  }

  listJobs({ fundingClass = null } = {}) {
    let jobs = this._state.jobs.map(clone);
    if (fundingClass) {
      jobs = jobs.filter((job) => job.fundingClass === fundingClass);
    }
    return jobs;
  }

  getJob(jobId) {
    const job = this._state.jobs.find((entry) => entry.id === jobId);
    if (!job) throw boardError(ERROR_CODES.unknown_job, `Unknown job: ${jobId}`);
    return clone(job);
  }

  getJobDossier(jobId) {
    const job = this.getJob(jobId);
    return {
      job,
      proposals: this._state.proposals.filter((p) => p.jobId === jobId).map(clone),
      completions: this._state.completions.filter((c) => c.jobId === jobId).map(clone),
      corrections: this._state.corrections.filter((c) => c.jobId === jobId).map(clone),
      events: this._state.events.filter((e) => e.jobId === jobId).map(clone),
      fundingHonesty:
        job.fundingClass === FUNDING_CLASS.demonstration
          ? "demonstration · unfunded · not escrowed"
          : job.fundingClass === FUNDING_CLASS.external
            ? "external link only · no in-board custody"
            : "sponsored · still no escrow on this board",
    };
  }

  /**
   * Create a labelled job. Demonstration rows must stay labelled. Does not
   * custody funds or open a hosted marketplace row.
   */
  createJob({
    id,
    title,
    brief,
    deliverableContract,
    acceptanceEvidence,
    fundingClass,
    label = null,
    externalLink = null,
    correspondenceProjectHint = null,
    idempotencyKey,
  }) {
    const titleText = requireString(title, "title", { max: 160 });
    const briefText = requireString(brief, "brief");
    const resolvedId = id
      ? requireId(id, "jobId")
      : `job_${hashKey({ title: titleText, brief: briefText }).slice(1, 17)}`;

    const requestHash = hashKey({
      op: "createJob",
      id: resolvedId,
      title: titleText,
      brief: briefText,
      deliverableContract,
      acceptanceEvidence,
      fundingClass,
      label,
      externalLink,
    });

    const result = this._idempotent("createJob", idempotencyKey, requestHash, () => {
      if (this._state.jobs.some((entry) => entry.id === resolvedId)) {
        throw boardError(ERROR_CODES.conflict, `job ${resolvedId} already exists`, {
          jobId: resolvedId,
        });
      }
      const now = nowIso(this._clock);
      const job = validateJobRecord({
        id: resolvedId,
        title: titleText,
        brief: briefText,
        deliverableContract,
        acceptanceEvidence,
        fundingClass,
        label,
        externalLink,
        status: JOB_STATUS.open,
        version: 1,
        correspondenceProjectHint: correspondenceProjectHint || `work-board:${resolvedId}`,
        createdAt: now,
        updatedAt: now,
      });
      this._state.jobs.push(job);
      const event = this._appendEvent({
        jobId: job.id,
        kind: EVENT_KINDS.request,
        text: `Created job ${job.id}: ${job.title}`,
        actorId: "board-operator",
        relatedIds: [job.id],
      });
      return { job: clone(job), event };
    });

    return result.value;
  }

  listEvents({ jobId = null, afterSequence = 0, limit = 50 } = {}) {
    const max = Math.min(Math.max(Number(limit) || 50, 1), 100);
    let events = this._state.events;
    if (jobId) events = events.filter((e) => e.jobId === jobId);
    events = events.filter((e) => e.sequence > afterSequence).slice(0, max);
    return events.map(clone);
  }

  _jobRef(jobId) {
    const job = this._state.jobs.find((entry) => entry.id === jobId);
    if (!job) throw boardError(ERROR_CODES.unknown_job, `Unknown job: ${jobId}`);
    return job;
  }

  _assertFresh(job, expectedVersion) {
    const expected = requireVersion(expectedVersion);
    if (job.version !== expected) {
      throw boardError(
        ERROR_CODES.stale_version,
        `stale submission: job ${job.id} is at version ${job.version}, submission expected ${expected}`,
        { currentVersion: job.version, expectedVersion: expected },
      );
    }
  }

  _idempotent(scope, key, requestHash, compute) {
    const idemKey = requireString(key, "idempotencyKey", { max: 200 });
    const mapKey = `${scope}::${idemKey}`;
    const prior = this._idempotency.get(mapKey);
    if (prior) {
      if (prior.requestHash !== requestHash) {
        throw boardError(
          ERROR_CODES.conflict,
          "idempotency key reused with a different request body",
          { idempotencyKey: idemKey },
        );
      }
      return { replay: true, value: clone(prior.value) };
    }
    const value = compute();
    this._idempotency.set(mapKey, { requestHash, value: clone(value) });
    return { replay: false, value };
  }

  _appendEvent({ jobId, kind, text, artifact, actorId, relatedIds = [] }) {
    this._seq += 1;
    const event = {
      id: `ev_${this._seq}`,
      jobId,
      sequence: this._seq,
      kind,
      text: text || undefined,
      artifact: artifact || undefined,
      actorId,
      relatedIds,
      createdAt: nowIso(this._clock),
      // Correspondence-shaped projection for handoff without a second protocol.
      correspondence: {
        projectHint: this._jobRef(jobId).correspondenceProjectHint,
        kind,
      },
    };
    this._state.events.push(event);
    return clone(event);
  }

  /**
   * Agent proposes to take a job. Conflicting open proposals from different
   * agents are allowed as competing proposals; the same agent cannot open two
   * active proposals on one job without superseding.
   */
  submitProposal({
    jobId,
    agentId,
    summary,
    expectedVersion,
    idempotencyKey,
  }) {
    const job = this._jobRef(requireId(jobId, "jobId"));
    const agent = requireId(agentId, "agentId");
    const text = requireString(summary, "summary");
    const expected = requireVersion(expectedVersion);

    const requestHash = hashKey({
      op: "proposal",
      jobId: job.id,
      agentId: agent,
      summary: text,
      expectedVersion: expected,
    });

    // Idempotent replay must win before freshness so retries of a committed
    // write are not rejected merely because that write advanced the version.
    const result = this._idempotent(`proposal:${job.id}`, idempotencyKey, requestHash, () => {
      this._assertFresh(job, expected);

      const activeSameAgent = this._state.proposals.find(
        (p) => p.jobId === job.id && p.agentId === agent && p.status === PROPOSAL_STATUS.submitted,
      );
      if (activeSameAgent) {
        throw boardError(
          ERROR_CODES.duplicate_agent_proposal,
          `agent ${agent} already has an open proposal on ${job.id}`,
          { existingProposalId: activeSameAgent.id },
        );
      }

      const competing = this._state.proposals.filter(
        (p) => p.jobId === job.id && p.status === PROPOSAL_STATUS.submitted && p.agentId !== agent,
      );

      job.version += 1;
      job.updatedAt = nowIso(this._clock);
      if (job.status === JOB_STATUS.open) job.status = JOB_STATUS.proposed;

      const proposal = {
        id: `prop_${job.id}_${job.version}`,
        jobId: job.id,
        agentId: agent,
        summary: text,
        status: PROPOSAL_STATUS.submitted,
        basedOnVersion: expected,
        jobVersionAfter: job.version,
        competingProposalIds: competing.map((p) => p.id),
        createdAt: nowIso(this._clock),
      };
      this._state.proposals.push(proposal);

      const event = this._appendEvent({
        jobId: job.id,
        kind: EVENT_KINDS.request,
        text: `Proposal from ${agent}: ${text}`,
        actorId: agent,
        relatedIds: [proposal.id, ...proposal.competingProposalIds],
      });

      return { proposal: clone(proposal), job: clone(job), event, competingCount: competing.length };
    });

    return result.value;
  }

  /**
   * Complete a job with a required artifact. Rejects missing/invalid artifacts,
   * stale versions, and a second completion after one is already accepted
   * (conflict). Retries with the same idempotency key dedupe.
   */
  submitCompletion({
    jobId,
    agentId,
    proposalId,
    artifact,
    evidenceNotes,
    expectedVersion,
    idempotencyKey,
  }) {
    const job = this._jobRef(requireId(jobId, "jobId"));
    const agent = requireId(agentId, "agentId");
    const notes = Array.isArray(evidenceNotes)
      ? evidenceNotes.map((n, i) => requireString(n, `evidenceNotes[${i}]`, { max: 500 }))
      : [];
    const expected = requireVersion(expectedVersion);

    const art = validateArtifact(artifact, { required: true });
    const propId = proposalId ? requireId(proposalId, "proposalId") : null;
    if (propId) {
      const proposal = this._state.proposals.find((p) => p.id === propId && p.jobId === job.id);
      if (!proposal) {
        throw boardError(ERROR_CODES.invalid_input, `proposal ${propId} not found on job ${job.id}`);
      }
      if (proposal.agentId !== agent) {
        throw boardError(ERROR_CODES.conflict, "proposal belongs to a different agent");
      }
    }

    const requestHash = hashKey({
      op: "completion",
      jobId: job.id,
      agentId: agent,
      proposalId: propId,
      artifact: art,
      evidenceNotes: notes,
      expectedVersion: expected,
    });

    const result = this._idempotent(`completion:${job.id}`, idempotencyKey, requestHash, () => {
      this._assertFresh(job, expected);

      const existingAccepted = this._state.completions.find(
        (c) => c.jobId === job.id && c.status === "accepted",
      );
      if (existingAccepted && existingAccepted.agentId !== agent) {
        throw boardError(
          ERROR_CODES.conflict,
          `job ${job.id} already has an accepted completion from ${existingAccepted.agentId}`,
          { existingCompletionId: existingAccepted.id },
        );
      }

      job.version += 1;
      job.updatedAt = nowIso(this._clock);
      job.status = JOB_STATUS.completed;

      if (propId) {
        const proposal = this._state.proposals.find((p) => p.id === propId);
        if (proposal) proposal.status = PROPOSAL_STATUS.accepted;
        for (const other of this._state.proposals) {
          if (other.jobId === job.id && other.id !== propId && other.status === PROPOSAL_STATUS.submitted) {
            other.status = PROPOSAL_STATUS.rejected;
          }
        }
      }

      const completion = {
        id: `cmp_${job.id}_${job.version}`,
        jobId: job.id,
        agentId: agent,
        proposalId: propId,
        artifact: art,
        evidenceNotes: notes,
        status: "accepted",
        basedOnVersion: expected,
        jobVersionAfter: job.version,
        createdAt: nowIso(this._clock),
      };
      this._state.completions.push(completion);

      const event = this._appendEvent({
        jobId: job.id,
        kind: EVENT_KINDS.artifact,
        text: `Completion artifact from ${agent}`,
        artifact: art,
        actorId: agent,
        relatedIds: [completion.id, propId].filter(Boolean),
      });

      return { completion: clone(completion), job: clone(job), event };
    });

    return result.value;
  }

  /**
   * Post a correction that supersedes a prior completion without rewriting it.
   */
  submitCorrection({
    jobId,
    agentId,
    correctsCompletionId,
    text,
    artifact = null,
    expectedVersion,
    idempotencyKey,
  }) {
    const job = this._jobRef(requireId(jobId, "jobId"));
    const agent = requireId(agentId, "agentId");
    const body = requireString(text, "text");
    const correctsId = requireId(correctsCompletionId, "correctsCompletionId");
    const expected = requireVersion(expectedVersion);

    const prior = this._state.completions.find((c) => c.id === correctsId && c.jobId === job.id);
    if (!prior) {
      throw boardError(ERROR_CODES.invalid_input, `completion ${correctsId} not found on job ${job.id}`);
    }

    const art = validateArtifact(artifact, { required: false });
    const requestHash = hashKey({
      op: "correction",
      jobId: job.id,
      agentId: agent,
      correctsCompletionId: correctsId,
      text: body,
      artifact: art,
      expectedVersion: expected,
    });

    const result = this._idempotent(`correction:${job.id}`, idempotencyKey, requestHash, () => {
      this._assertFresh(job, expected);

      job.version += 1;
      job.updatedAt = nowIso(this._clock);
      job.status = JOB_STATUS.corrected;

      prior.status = "superseded";

      const correction = {
        id: `cor_${job.id}_${job.version}`,
        jobId: job.id,
        agentId: agent,
        correctsCompletionId: correctsId,
        supersedesCompletionId: correctsId,
        text: body,
        artifact: art,
        basedOnVersion: expected,
        jobVersionAfter: job.version,
        createdAt: nowIso(this._clock),
      };
      this._state.corrections.push(correction);

      const event = this._appendEvent({
        jobId: job.id,
        kind: EVENT_KINDS.correction,
        text: body,
        artifact: art || undefined,
        actorId: agent,
        relatedIds: [correction.id, correctsId],
      });

      return { correction: clone(correction), job: clone(job), event };
    });

    return result.value;
  }
}

export function createWorkBoard(options) {
  return new WorkBoard(options?.seed, { clock: options?.clock });
}
