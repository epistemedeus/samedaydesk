import { Assignment, Attestation, Command, Limits, Policy, clone, commands, digest, FoundryError, jsonBounded, refKey, requireThat as need, sameRef, schemaId, validate } from './contracts.mjs';

const outstanding = c => ['queued', 'running', 'retry_wait', 'awaiting_review'].includes(c.stage);
const response = (code, nextAction, extra = {}) => ({ code, nextAction, ...extra });
const independent = (actor, c) => actor.subject !== c.contributor.subject && actor.group !== null && c.contributor.group !== null && actor.group !== c.contributor.group;
const inScope = (actor, scope) => actor.scopes.includes(scope);
function role(actor, wanted, scope) {
  need(actor.roles.includes(wanted) && (scope === undefined || inScope(actor, scope)), 'forbidden', 'Use an existing host-authorized principal for this scope and operation.');
}
function stageView(c) {
  return { candidateId: c.candidate.id, stage: c.stage, active: c.active, usability: c.usability, acceptance: c.acceptance, promotion: c.promotion, currentReceiptId: c.receiptId, attempts: c.attempts, retryAt: c.stage === 'retry_wait' ? c.retryAt : null, deadline: c.stage === 'running' ? c.assignment.deadline : null };
}

/**
 * Single-process reference coordinator. Handles are installed by the trusted host,
 * never deserialized from a body. Snapshots are projections, not import credentials.
 * Heavy must transact this state + idempotency + outbox in the existing PG service.
 */
export class ValidationService {
  #state; #principals = new Map(); #policies; #limits; #clock; #mode;
  constructor({ principals, policies, limits, dependencies = [], clock = () => new Date().toISOString(), mode = 'fixture' }) {
    validate(Limits, limits); need(['fixture', 'trusted_runner'].includes(mode), 'invalid_mode');
    this.#limits = clone(limits); this.#clock = clock; this.#mode = mode;
    this.#policies = policies.map(p => { validate(Policy, p); return clone(p); });
    need(new Set(policies.map(p => p.scope)).size === policies.length, 'duplicate_policy_scope');
    for (const p of policies) {
      need(p.requiredChecks.length > 0 && new Set(p.requiredChecks).size === p.requiredChecks.length, 'empty_or_duplicate_checks');
      need(p.attempt.cpuMs > 0 && p.attempt.wallMs > 0 && p.attempt.cost.currency === limits.maxCost.currency, 'invalid_reservation');
    }
    for (const { handle, ...actor } of principals) {
      need(handle && typeof handle === 'object' && !this.#principals.has(handle), 'invalid_principal_handle');
      need(typeof actor.subject === 'string' && actor.subject.includes(':') && (actor.group === null || typeof actor.group === 'string' && actor.group.length > 0) && Array.isArray(actor.roles) && Array.isArray(actor.scopes), 'invalid_principal');
      need(actor.scopes.every(s => policies.some(p => p.scope === s)), 'unknown_principal_scope');
      if (actor.roles.includes('runner')) need(actor.assignmentEvidence && Array.isArray(actor.evaluators), 'assignment_evidence_required');
      this.#principals.set(handle, clone(actor));
    }
    this.#state = {
      schema: schemaId('validation_snapshot'), revision: 0, mode,
      configDigest: digest({ policies, limits, dependencies }),
      policies:clone(this.#policies), candidates: {}, receipts: {}, observations: {}, attestations: {}, retractedObservations: {},
      dependencies: Object.fromEntries(dependencies.map(d => [refKey(d.ref), { ref: clone(d.ref), active: d.active === true }])),
      invalidatedRefs: {}, idempotency: {}, events: [], lastServed: {}, dispatchSequence: 0,
      charged: { cpuMs: 0, wallMs: 0, costUnits: '0', reviewMs: 0, reviews: 0 }, haltedReason: null, lastTime: null,
    };
  }
  // Rebuild only a fresh private engine; ordinary dispatch retains rollback.
  static replay(config, entries) {
    const service = new ValidationService(config);
    need(Array.isArray(entries) && entries.length <= service.#limits.maxCommands, 'journal_capacity');
    const liveClock = service.#clock;
    let index = 0, result;
    try {
      for (; index < entries.length; index++) {
        const entry = entries[index];
        const at = entry.at; result = undefined;
        service.#clock = () => at;
        result = service.#dispatch(entry.handle, entry.command, true);
        need(result.ok && digest(result) === digest(entry.response), 'durable_replay_mismatch');
      }
      service.#clock = liveClock;
      return service;
    } catch (error) {
      service.#state = null;
      service.#principals.clear();
      try { error.replayIndex = index; error.replayCode = result?.ok === false ? result.code : result?.ok ? 'response_mismatch' : null; } catch {}
      throw error;
    }
  }
  snapshot() { return clone(this.#state); }
  dispatch(handle, raw) { return this.#dispatch(handle, raw, false); }
  #dispatch(handle, raw, freshReplay) {
    try {
      const actor = this.#principals.get(handle);
      need(actor, 'unauthenticated', 'Authenticate at the host; a claimed verifier ID or serialized handle is not authority.');
      const command = jsonBounded(raw); validate(Command, command); validate(commands[command.type], command.payload);
      const key = `${actor.subject}|${command.id}`;
      const signature = digest({ type: command.type, payload: command.payload });
      const previous = this.#state.idempotency[key];
      if (previous) {
        need(previous.signature === signature, 'idempotency_conflict', 'Use a new command ID for changed material.');
        return { ok: true, duplicate: true, historical: previous.revision !== this.#state.revision, revision: this.#state.revision, resultRevision: previous.revision, result: clone(previous.result) };
      }
      need(command.expectedRevision === this.#state.revision, 'revision_conflict', 'Read the current projection and retry the unchanged command ID with its revision.');
      need(this.#state.events.length < this.#limits.maxCommands, 'journal_full', 'Persist and rotate this bounded coordinator through the receiving host; retain dedup tombstones.');
      const now = this.#clock();
      validate({ type: 'string', format: 'utc-time' }, now);
      need(!this.#state.lastTime || Date.parse(now) >= Date.parse(this.#state.lastTime), 'clock_regressed');
      const draft = freshReplay ? this.#state : clone(this.#state);
      const result = this.#apply(draft, actor, command.type, command.payload, now);
      draft.revision++; draft.lastTime = now;
      draft.events.push({ schema: schemaId('validation_event'), sequence: draft.revision, commandId: command.id, actor: actor.subject, type: command.type, at: now, payloadDigest: digest(command.payload), payload: clone(command.payload), result: clone(result) });
      draft.idempotency[key] = { signature, result: clone(result), revision: draft.revision };
      this.#state = draft;
      return { ok: true, duplicate: false, revision: draft.revision, result: clone(result) };
    } catch (error) {
      if (!(error instanceof FoundryError)) throw error;
      return { ok: false, code: error.code, nextAction: error.nextAction, revision: this.#state.revision };
    }
  }
  #candidate(s, id) { const c = s.candidates[id]; need(c, 'candidate_not_found'); return c; }
  #policy(c) { return c.roundPolicy ?? this.#policies.find(p => p.scope === c.candidate.scope); }
  #dependenciesActive(s, c) {
    return c.candidate.dependencies.every(ref => {
      if (s.invalidatedRefs[refKey(ref)]) return false;
      const local = Object.values(s.candidates).find(x => sameRef(x.candidate.capability, ref));
      return local ? local.active && local.acceptance === 'accepted' : s.dependencies[refKey(ref)]?.active === true;
    });
  }
  #room(s, scope) {
    const pending = Object.values(s.candidates).filter(outstanding);
    need(pending.length < this.#limits.maxOutstanding, 'backlog_full', 'Wait for a completion/review/invalidation event, then retry admission.');
    need(pending.filter(c => c.candidate.scope === scope).length < this.#limits.maxPerScope, 'scope_backlog_full', 'Wait for capacity in this authorized scope, then retry admission.');
  }
  #apply(s, actor, type, p, now) {
    if(type==='configurePolicy') {
      role(actor,'operator',p.scope);
      need(s.policies.some(x=>x.scope===p.scope),'policy_unavailable');
      need(p.requiredChecks.length>0&&new Set(p.requiredChecks).size===p.requiredChecks.length,'empty_or_duplicate_checks');
      need(p.attempt.cpuMs>0&&p.attempt.wallMs>0&&p.attempt.cost.currency===this.#limits.maxCost.currency,'invalid_reservation');
      s.policies=s.policies.map(x=>x.scope===p.scope?clone(p):x);
      return response('policy_configured','Only new submissions or explicit new generations use this policy.',{policyId:p.id,policyRevision:p.revision});
    }
    if(type==='revalidate') {
      const c=this.#candidate(s,p.candidateId);role(actor,'operator',c.candidate.scope);
      need(c.active&&!s.invalidatedRefs[refKey(c.candidate.capability)],'candidate_ineligible');
      need((c.generation??1)===p.expectedGeneration,'generation_conflict');
      need(['accepted','verification_failed','timed_out'].includes(c.stage),'revalidation_not_ready');
      need((c.generation??1)<8,'generation_capacity');need(!s.haltedReason,'validation_halted');
      need(this.#dependenciesActive(s,c),'dependency_unavailable');this.#room(s,c.candidate.scope);
      const policy=s.policies.find(x=>x.scope===c.candidate.scope),r=policy.attempt;
      need(s.charged.cpuMs+r.cpuMs<=this.#limits.maxCpuMs&&s.charged.wallMs+r.wallMs<=this.#limits.maxWallMs
        &&BigInt(s.charged.costUnits)+BigInt(r.cost.units)<=BigInt(this.#limits.maxCost.units),'budget_exhausted');
      (c.rounds??=[]).push({generation:c.generation??1,policy:clone(this.#policy(c)),assignment:clone(c.assignment),receiptId:c.receiptId,
        stage:c.stage,acceptance:c.acceptance,usability:c.usability,closedAt:now,reason:p.reason});
      c.generation=(c.generation??1)+1;c.roundPolicy=clone(policy);c.policy={id:policy.id,revision:policy.revision};
      c.stage='queued';c.acceptance='pending';c.usability='unknown';c.promotion='not_promoted';c.attempts=0;c.assignment=null;c.receiptId=null;
      c.queuedSequence=s.revision+1;delete c.acceptedAt;delete c.review;delete c.promotionEvidence;
      return response('revalidation_queued','Await a freshly fenced independent assignment; historical evidence is not renewed.',{...stageView(c),generation:c.generation});
    }
    if(type==='finishUnknown') {
      const c=this.#candidate(s,p.candidateId);role(actor,'operator',c.candidate.scope);
      need(c.active&&(c.stage==='running'&&c.assignment?.id===p.assignmentId || c.stage==='queued'&&p.assignmentId===null),'stale_assignment');
      c.stage='timed_out';c.acceptance='rejected';c.usability='unknown';c.unknown={reason:p.reason,evidence:clone(p.evidence),at:now};
      return response('verification_unknown','Keep original evidence; only explicit authorized revalidation may try again.',stageView(c));
    }
    if (type === 'submit') {
      role(actor, 'contributor', p.scope);
      const policy = s.policies.find(x => x.scope === p.scope); need(policy, 'policy_unavailable');
      const priorId = s.candidates[p.id];
      if (priorId) { need(digest(priorId.candidate) === digest(p) && priorId.contributor.subject === actor.subject, 'candidate_id_conflict'); return response('duplicate_candidate', 'Read the existing candidate status.', stageView(priorId)); }
      // One immutable capability revision cannot be renamed to obtain another budget.
      const existing = Object.values(s.candidates).find(c => sameRef(c.candidate.capability, p.capability));
      need(!existing && !s.dependencies[refKey(p.capability)], 'capability_revision_exists', 'Use the existing candidate/source pin; corrections need a new immutable capability revision.');
      need(!s.invalidatedRefs[refKey(p.capability)], 'revision_invalidated', 'Submit a corrected new revision.');
      need(!p.dependencies.some(ref => sameRef(ref, p.capability)) && new Set(p.dependencies.map(refKey)).size === p.dependencies.length, 'invalid_dependencies');
      need(Object.keys(s.candidates).length < this.#limits.maxRecords, 'record_capacity', 'Persist/archive through the host without dropping revision or dedup history.');
      const c = { candidate: clone(p), contributor: { subject: actor.subject, group: actor.group }, submittedAt: now, queuedSequence: s.revision + 1, policy: { id: policy.id, revision: policy.revision }, roundPolicy:clone(policy), active: true, stage: 'queued', usability: 'unknown', acceptance: 'pending', promotion: 'not_promoted', attempts: 0, assignment: null, receiptId: null, invalidation: null };
      need(this.#dependenciesActive(s, c), 'dependency_unavailable', 'Resolve exact dependency revisions and their current acceptance before admission.');
      if (p.supersedes !== null) {
        const old = this.#candidate(s, p.supersedes);
        need(old.contributor.subject === actor.subject && old.candidate.scope === p.scope && old.candidate.capability.id === p.capability.id && old.candidate.capability.revision !== p.capability.revision, 'invalid_correction');
        this.#invalidate(s, old.candidate.capability, { reason: 'candidate_corrected', evidence: { ref: p.artifactRef, revision: p.sourceRevision }, at: now });
      }
      this.#room(s, p.scope); s.candidates[p.id] = c;
      return response('queued', 'Wait for an independently assigned runner.', stageView(c));
    }
    if (type === 'assign') {
      role(actor, 'operator');
      need(s.haltedReason === null, 'validation_halted', 'Reconcile the recorded runner budget breach before the host authorizes a new validation pool.');
      const running = Object.values(s.candidates).filter(c => c.stage === 'running');
      need(running.length < this.#limits.maxRunning, 'running_capacity', 'Wait for a receipt or expire leases whose deadlines have passed.');
      const eligible = Object.values(s.candidates).filter(c => c.active && c.stage === 'queued' && inScope(actor, c.candidate.scope))
        .sort((a, b) => (s.lastServed[a.candidate.scope] ?? 0) - (s.lastServed[b.candidate.scope] ?? 0) || a.queuedSequence - b.queuedSequence || a.candidate.id.localeCompare(b.candidate.id));
      const blocked = [];
      for (const c of eligible) {
        const policy = this.#policy(c); const scope = c.candidate.scope; const r = policy.attempt;
        if (running.filter(x => x.candidate.scope === scope).length >= this.#limits.maxRunningPerScope) { blocked.push('scope_running_capacity'); continue; }
        const runner = [...this.#principals.values()].filter(x => x.roles.includes('runner') && inScope(x, scope) && independent(x, c) && x.evaluators.some(e => sameRef(e, policy.evaluator)))
          .sort((a, b) => a.subject.localeCompare(b.subject))[0];
        if (!runner) { blocked.push('independent_runner_unavailable'); continue; }
        if (!this.#dependenciesActive(s, c)) { blocked.push('dependency_unavailable'); continue; }
        if (running.reduce((n, x) => n + x.assignment.reservation.memoryMb, 0) + r.memoryMb > this.#limits.maxMemoryMb) { blocked.push('memory_capacity'); continue; }
        if (s.charged.cpuMs + r.cpuMs > this.#limits.maxCpuMs || s.charged.wallMs + r.wallMs > this.#limits.maxWallMs || BigInt(s.charged.costUnits) + BigInt(r.cost.units) > BigInt(this.#limits.maxCost.units)) { blocked.push('budget_exhausted'); continue; }
        // Charge the full authorized cap before dispatch. Missing usage / crashes never refund it.
        s.charged.cpuMs += r.cpuMs; s.charged.wallMs += r.wallMs;
        s.charged.costUnits = (BigInt(s.charged.costUnits) + BigInt(r.cost.units)).toString();
        c.attempts++; c.stage = 'running'; s.dispatchSequence++;
        s.lastServed[scope] = s.dispatchSequence;
        c.assignment = {
          schema: schemaId('verification_assignment'), id: `assignment:${s.dispatchSequence}`,
          candidateId: c.candidate.id, capability: c.candidate.capability, sourceRevision: c.candidate.sourceRevision,
          artifactDigest: c.candidate.artifactDigest, dependencyDigest: digest(c.candidate.dependencies),
          evaluator: policy.evaluator, environmentDigest: policy.environmentDigest, requiredChecks: policy.requiredChecks,
          runner: runner.subject, assignmentEvidence: runner.assignmentEvidence, mode: this.#mode,
          attempt: c.attempts, assignedAt: now, deadline: new Date(Date.parse(now) + r.wallMs).toISOString(), reservation: clone(r),
        };
        validate(Assignment, c.assignment);
        return response('assigned', 'Trusted runner: fetch the pinned artifact, enforce the reservation, execute the installed evaluator, and return observed evidence.', { assignment: clone(c.assignment) });
      }
      const code = blocked[0] ?? 'queue_empty';
      const actions = { independent_runner_unavailable: 'An operator must bind an independently assigned runner with evidence; contributor identity claims cannot fill this role.', memory_capacity: 'Wait for running assignments to release memory; if the recipe alone exceeds capacity, the host must authorize a different cap or recipe.', budget_exhausted: 'Wait for an explicitly authorized new budget window in the receiving host; this coordinator never refills itself.', dependency_unavailable: 'Invalidate the affected candidate and submit against current dependencies.', scope_running_capacity: 'Wait for completion or expire a due lease.' };
      throw new FoundryError(code, actions[code] ?? 'Admit a candidate or advance due retry leases.');
    }
    if (type === 'receipt') {
      const c = this.#candidate(s, p.candidateId); role(actor, 'runner', c.candidate.scope);
      const a = c.assignment; need(a && a.runner === actor.subject && independent(actor, c), 'unassigned_verifier');
      need(a.id === p.assignmentId, 'stale_assignment', 'Discard this expired attempt; return evidence only for the current assigned attempt.');
      const prior = s.receipts[p.id];
      if (prior) { need(digest(prior.receipt) === digest(p), 'receipt_id_conflict'); need(prior.active && c.active, 'receipt_revoked'); return response('duplicate_receipt', 'Read current candidate status; no budget charged again.', stageView(c)); }
      if (c.receiptId) {
        const old = s.receipts[c.receiptId];
        need(old.active && digest({ ...old.receipt, id: p.id }) === digest(p), 'receipt_conflict', 'Correct/revoke the old evidence through an operator; do not overwrite observations.');
        return response('duplicate_receipt', 'Read the canonical receipt; renamed replay is not new verification.', stageView(c));
      }
      need(c.active && c.stage === 'running', 'candidate_not_running');
      need(Date.parse(now) < Date.parse(a.deadline), 'lease_expired', 'Expire the lease; late evidence cannot complete or promote this attempt.');
      need(Date.parse(p.observedAt) >= Date.parse(a.assignedAt) && Date.parse(p.observedAt) <= Date.parse(now), 'invalid_observation_time');
      for (const field of ['capability', 'sourceRevision', 'artifactDigest', 'dependencyDigest', 'evaluator', 'environmentDigest']) need(digest(p[field]) === digest(a[field]), `receipt_binding:${field}`);
      need(this.#dependenciesActive(s, c), 'dependency_unavailable');
      const policy = this.#policy(c);
      const checks = p.observed.checks;
      need(new Set(checks.map(x => x.id)).size === checks.length && digest(checks.map(x => x.id).sort()) === digest([...policy.requiredChecks].sort()), 'check_coverage_mismatch');
      need(p.usage.cost === null || p.usage.cost.currency === a.reservation.cost.currency, 'cost_currency_mismatch');
      const exceeded = (p.usage.cpuMs !== null && p.usage.cpuMs > a.reservation.cpuMs) || (p.usage.wallMs !== null && p.usage.wallMs > a.reservation.wallMs) || (p.usage.cost !== null && BigInt(p.usage.cost.units) > BigInt(a.reservation.cost.units));
      const pass = checks.every(x => x.status === 'pass') && !exceeded;
      if (exceeded) s.haltedReason = 'runner_budget_breach';
      s.receipts[p.id] = { receipt: clone(p), active: true, admittedAt: now, runner: actor.subject, mode: this.#mode, budgetExceeded: exceeded };
      c.receiptId = p.id; c.usability = pass ? 'passed' : checks.some(x => x.status === 'fail') || exceeded ? 'failed' : 'unknown';
      if (!pass) { c.stage = 'verification_failed'; c.acceptance = 'rejected'; }
      else if (policy.risk === 'low' && policy.deterministic && p.observed.limitations.length === 0) { c.stage = 'accepted'; c.acceptance = 'accepted'; c.acceptedAt = now; }
      else { c.stage = 'awaiting_review'; c.acceptance = 'pending'; }
      return response(exceeded ? 'runner_budget_breach' : c.stage, c.stage === 'awaiting_review' ? 'An independent scoped reviewer must decide this exact receipt within the review budget.' : pass ? 'Acceptance is scoped to this revision and environment. Recommendation requires separate promotion.' : 'Inspect failed/incomplete observations; submit a corrected new candidate revision.', stageView(c));
    }
    if (type === 'expire') {
      role(actor, 'operator'); const changed = [];
      for (const c of Object.values(s.candidates)) {
        if (!inScope(actor, c.candidate.scope) || !c.active) continue;
        const policy = this.#policy(c);
        if (c.stage === 'running' && Date.parse(c.assignment.deadline) <= Date.parse(now)) {
          c.stage = c.attempts < policy.maxAttempts ? 'retry_wait' : 'timed_out';
          c.retryAt = new Date(Date.parse(now) + policy.retryDelayMs).toISOString();
          if (c.stage === 'timed_out') c.acceptance = 'rejected';
          changed.push(stageView(c));
        } else if (c.stage === 'retry_wait' && Date.parse(c.retryAt) <= Date.parse(now)) { c.stage = 'queued'; c.queuedSequence = s.revision + 1; changed.push(stageView(c)); }
      }
      return response('leases_advanced', 'Wait until retryAt, advance retries, then request a newly fenced assignment; each attempt needs budget.', { changed });
    }
    if (type === 'review' || type === 'promote') {
      const c = this.#candidate(s, p.candidateId);
      role(actor, type === 'review' ? 'reviewer' : 'operator', c.candidate.scope);
      need(independent(actor, c), 'self_review_forbidden');
      need(c.active && c.receiptId === p.receiptId && s.receipts[p.receiptId]?.active && this.#dependenciesActive(s, c), 'stale_review');
      if (type === 'review') {
        need(c.stage === 'awaiting_review' && c.usability === 'passed', 'review_not_ready');
        const policy = this.#policy(c);
        need(s.charged.reviews < this.#limits.maxReviews && s.charged.reviewMs + policy.reviewMs <= this.#limits.maxReviewMs, 'review_budget_exhausted', 'Wait for an explicitly authorized review budget; retain this pending review in the bounded backlog.');
        s.charged.reviews++; s.charged.reviewMs += policy.reviewMs;
        c.acceptance = p.decision === 'accept' ? 'accepted' : 'rejected'; c.stage = c.acceptance;
        c.review = { reviewer: actor.subject, evidence: p.evidence, decision: p.decision, at: now, receiptId: p.receiptId };
        if (c.acceptance === 'accepted') c.acceptedAt = now;
      } else { need(c.acceptance === 'accepted', 'not_accepted'); c.promotion = 'promoted'; c.promotionEvidence = { actor: actor.subject, ...p.evidence, at: now }; }
      return response(c.stage, 'Read the current revision-bound projection before recommending or invoking.', stageView(c));
    }
    if (type === 'invalidate') {
      role(actor, 'operator', p.scope);
      let ref;
      if (p.target === 'dependency') {
        need(p.dependency !== null && p.candidateId === null && p.receiptId === null, 'invalid_invalidation_target'); ref = p.dependency;
        // A scope cannot revoke a shared/global revision on another tenant's behalf.
        need(!Object.values(s.candidates).some(c => c.candidate.scope !== p.scope && (sameRef(c.candidate.capability, ref) || c.candidate.dependencies.some(d => sameRef(d, ref)))), 'cross_scope_invalidation', 'The receiving host must authorize and fan out shared dependency changes to all owning scopes atomically.');
      } else {
        need(p.dependency === null, 'invalid_invalidation_target');
        if (p.target === 'receipt') { need(p.receiptId !== null && p.candidateId === null && s.receipts[p.receiptId], 'receipt_not_found'); ref = this.#candidate(s, s.receipts[p.receiptId].receipt.candidateId).candidate.capability; }
        else { need(p.candidateId !== null && p.receiptId === null, 'invalid_invalidation_target'); ref = this.#candidate(s, p.candidateId).candidate.capability; }
        const c = Object.values(s.candidates).find(x => sameRef(x.candidate.capability, ref)); need(c.candidate.scope === p.scope, 'forbidden');
      }
      const invalidated = this.#invalidate(s, ref, { reason: p.reason, evidence: p.evidence, at: now });
      return response('invalidated', 'Remove affected versions from recommendation caches; preserve historical receipts and submit corrected new revisions.', { invalidated });
    }
    if (type === 'observe') {
      role(actor, 'beneficiary', p.scope);
      need(p.cohort.arm !== 'baseline', 'baseline_is_not_reuse', 'Supply a separate no-network baseline trial to compareCohorts.');
      const c = this.#candidate(s, p.candidateId);
      need(c.candidate.scope === p.scope && sameRef(c.candidate.capability, p.capability), 'reuse_binding');
      need(c.active && c.acceptance === 'accepted' && this.#dependenciesActive(s, c), 'reuse_candidate_unavailable');
      need(p.taskId !== c.candidate.taskId && Date.parse(p.occurredAt) > Date.parse(c.acceptedAt) && Date.parse(p.occurredAt) <= Date.parse(now), 'not_later_task');
      const oldId = s.observations[p.id];
      if (oldId) { need(oldId.beneficiary === actor.subject && digest(oldId.observation) === digest(p), 'observation_id_conflict'); return response('duplicate_observation', 'Read existing observation; no new reuse counted.', { observationId: p.id }); }
      const sameTask = Object.values(s.observations).filter(o => o.observation.scope === p.scope && o.observation.taskId === p.taskId && sameRef(o.observation.capability, p.capability) && !s.retractedObservations[o.observation.id] && !o.supersededBy);
      if (p.supersedes !== null) {
        const previous = s.observations[p.supersedes];
        need(previous && previous.beneficiary === actor.subject && sameTask.length === 1 && sameTask[0] === previous, 'invalid_observation_correction');
        need(Date.parse(p.occurredAt) >= Date.parse(previous.observation.occurredAt), 'correction_time_regressed');
        previous.supersededBy = p.id;
      } else need(sameTask.length === 0, 'repeated_task', 'A later observation of this same task is a correction, not another reuse.');
      need(Object.keys(s.observations).length < this.#limits.maxRecords, 'record_capacity');
      s.observations[p.id] = { observation: clone(p), beneficiary: actor.subject, beneficiaryGroup: actor.group, admittedAt: now, mode: this.#mode, supersededBy: null, digest: digest(p) };
      return response('reuse_claim_recorded', 'Keep relationship and outcome as declarations until independently sourced attestations are admitted.', { observationId: p.id });
    }
    if (type === 'attest') {
      validate(Attestation, p);
      const o = s.observations[p.observationId]; need(o, 'observation_not_found');
      role(actor, 'evidence_reader', o.observation.scope);
      const c = this.#candidate(s, o.observation.candidateId);
      need(actor.subject !== o.beneficiary && actor.group !== null && actor.group !== o.beneficiaryGroup && independent(actor, c), 'self_attestation_forbidden');
      need(o.digest === p.observationDigest && !o.supersededBy && !s.retractedObservations[p.observationId] && c.active, 'stale_attestation');
      need(p.independence !== 'established' || !['owner', 'affiliated'].includes(o.observation.relationship), 'relationship_evidence_conflict', 'Correct the relationship declaration with source evidence before establishing independence.');
      const existing = s.attestations[p.observationId];
      if (existing) { need(digest(existing.attestation) === digest(p) && existing.actor === actor.subject, 'attestation_conflict', 'Retract/correct the observation with new evidence; do not replace the original attestation.'); return response('duplicate_attestation', 'Read existing attestation.'); }
      s.attestations[p.observationId] = { attestation: clone(p), actor: actor.subject, admittedAt: now, mode: this.#mode };
      return response('attestation_recorded', 'Project usefulness and independence separately from settlement.');
    }
    if (type === 'retractObservation') {
      const o = s.observations[p.observationId]; need(o, 'observation_not_found');
      need(inScope(actor, o.observation.scope) && (actor.roles.includes('operator') || actor.subject === o.beneficiary), 'forbidden');
      s.retractedObservations[p.observationId] = { ...clone(p), actor: actor.subject, at: now };
      return response('observation_retracted', 'Exclude this observation from current cohorts; retain its original evidence.');
    }
    throw new FoundryError('unsupported_command', 'Use a supported versioned command.');
  }
  #invalidate(s, initial, evidence) {
    const refs = [initial]; const invalidated = [];
    while (refs.length) {
      const ref = refs.shift(); const key = refKey(ref);
      s.invalidatedRefs[key] = clone(evidence);
      if (s.dependencies[key]) s.dependencies[key].active = false;
      for (const c of Object.values(s.candidates)) {
        if (!c.active || (!sameRef(c.candidate.capability, ref) && !c.candidate.dependencies.some(d => sameRef(d, ref)))) continue;
        c.active = false; c.stage = 'invalidated'; c.usability = 'invalidated'; c.acceptance = 'invalidated'; c.promotion = 'withdrawn'; c.invalidation = clone(evidence);
        if (c.receiptId) s.receipts[c.receiptId].active = false;
        invalidated.push(c.candidate.capability); refs.push(c.candidate.capability);
      }
    }
    return invalidated;
  }
}
