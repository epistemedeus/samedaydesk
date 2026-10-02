import { randomUUID } from "node:crypto";
import { FoundryBoundary } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/visitor-foundry/boundary.js";
import { WorkCellStore } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/visitor-work-cells/store.js";
import { cellIdFor } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/visitor-work-cells/contracts.js";
import { exportReuse } from "../../result-reuse/src/export.mjs";
import { inspectCorrespondenceEnv } from "../../../server/lib/correspondence-mount.js";
import { Budget, JourneyError, within } from "./budget.mjs";
import { validateRequest, operationKey, hash, jobId, taskId, PREFIX } from "./contracts.mjs";
import { executeRecipe, failedExecution } from "./executor.mjs";

const ADMISSION = "sds:useful:admission:v1";
const REQUEST = "sds:useful:request:v1";
const RESULT = "sds:useful:result:v1";
const EXECUTION = "sds:useful:execution:v1";
const CANCEL = "sds:useful:cancel:v1";
const COMMAND = "neomorphic.foundry.work-cell-command.v1";

async function receipt(c, scope, projectId, key) {
  return (await c.query("SELECT request_hash,response_json FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2 AND key=$3", [scope, projectId, key])).rows[0];
}
async function append(c, scope, projectId, key, requestHash, body) {
  await c.query("INSERT INTO correspondence_idempotency(scope,project_id,key,request_hash,status_code,response_json,created_at) VALUES($1,$2,$3,$4,200,$5::jsonb,clock_timestamp())", [scope, projectId, key, requestHash, JSON.stringify(body)]);
}

export class UsefulJourneyService {
  constructor(databaseUrl, { schema = "pilot_correspondence", poolMax = 2 } = {}) {
    // These are the accepted authority/store adapters, not a parallel store.
    this.db = new FoundryBoundary(databaseUrl, { schema, poolMax });
    this.cells = new WorkCellStore(databaseUrl, { schema, poolMax });
    this.executions = new Map();
  }
  async close() {
    for (const controller of this.executions.values()) controller.abort();
    await Promise.allSettled([this.cells.close(), this.db.close()]);
  }
  async checkReady(budget = new Budget()) {
    await this.tx(budget, async c => {
      for (const table of ["correspondence_projects", "correspondence_grants", "correspondence_idempotency", "correspondence_vf02_work_cells"]) await c.query(`SELECT 1 FROM ${table} LIMIT 0`);
    });
  }
  async tx(budget, fn) {
    // The owning adapter bounds pool acquisition to 3s. Refuse to enter when
    // even that setup cannot fit. Each installed query uses the remaining time.
    budget.check(3000);
    return await within(this.db.tx(async client => {
      const query = async (text, values = []) => {
        budget.check(25);
        let remaining = budget.remaining(20);
        await client.query({ text: "SELECT set_config('statement_timeout',$1,true)", values: [`${remaining}ms`], query_timeout: remaining });
        budget.check(20);
        remaining = budget.remaining(15);
        budget.spend(Buffer.byteLength(JSON.stringify(values)), "postgres-write-arguments");
        const result = await client.query({ text, values, query_timeout: remaining });
        budget.spend(Buffer.byteLength(JSON.stringify(result.rows)), "postgres-read");
        return result;
      };
      const c = { query };
      const result = await fn(c);
      budget.check(25);
      // COMMIT belongs to FoundryBoundary, under the same remaining server limit.
      await client.query({ text: "SELECT set_config('statement_timeout',$1,true)", values: [`${budget.remaining(10)}ms`], query_timeout: budget.remaining(10) });
      budget.check(5);
      return result;
    }), budget);
  }
  async authenticated(context, budget, fn) {
    return await this.tx(budget, async c => {
      const value = await fn(c);
      // Grant revocation is ordered by the owning share lock. Expiry is time
      // dependent, so recheck after all row waits and immediately before commit.
      await this.db.authorize(c, context, false);
      return value;
    });
  }
  async bound(c, context, id, task, write = false) {
    jobId(id); taskId(task);
    const grant = await this.db.authorize(c, context, false);
    if (write && grant.role === "reader") throw new JourneyError(403, "forbidden");
    const record = (await receipt(c, REQUEST, context.projectId, id))?.response_json;
    if (!record || record.request.taskId !== task) throw new JourneyError(404, "not_found");
    if (write && grant.role !== "owner" && grant.id !== record.grantId) throw new JourneyError(403, "job_grant_mismatch");
    const cell = (await c.query("SELECT state FROM correspondence_vf02_work_cells WHERE project_id=$1 AND id=$2 FOR UPDATE", [context.projectId, id])).rows[0]?.state;
    if (!cell) throw new JourneyError(404, "not_found");
    const stored = (await receipt(c, RESULT, context.projectId, id))?.response_json;
    const execution = (await receipt(c, EXECUTION, context.projectId, id))?.response_json;
    const now = Date.parse(await this.db.now(c));
    const leaseGrant = cell.lease ? (await c.query("SELECT role,expires_at,revoked_at FROM correspondence_grants WHERE project_id=$1 AND id=$2", [context.projectId, cell.lease.grantId])).rows[0] : null;
    const live = Boolean(cell.lease && Date.parse(cell.lease.expiresAt) > now && leaseGrant && !leaseGrant.revoked_at && (!leaseGrant.expires_at || +leaseGrant.expires_at > now) && leaseGrant.role !== "reader");
    return { grant, record, cell, stored, execution, live, now };
  }
  view(id, bound) {
    const { cell, record, stored, execution, live, now } = bound;
    const state = cell.status === "cancelled" ? "cancelled" : stored ? (stored.result.execution === "failed" ? "failed" : "completed")
      : live ? "running" : now >= record.deadlineAt ? "expired" : execution ? "outcome_unknown" : "ready";
    return { schema: "samedaydesk.hosted-useful-status.v1", jobId: id, taskId: record.request.taskId,
      recipeId: record.request.recipeId, state, revision: cell.revision, fence: cell.fence,
      leaseExpiresAt: cell.lease?.expiresAt || null, deadlineAt: new Date(record.deadlineAt).toISOString(),
      resultDigest: state === "completed" || state === "failed" ? stored.digest : null,
      nextAction: state === "running" ? "Poll this opaque status. Reclaim only after current lease expiry."
        : state === "ready" ? "Run this admitted operation with the same project grant and task."
        : state === "completed" || state === "failed" ? "Retrieve the retained result; usefulness, acceptance and settlement remain separate."
        : "Stop this operation; inspect its status before admitting a new intent.",
      publicationVerified: false, earnedWorkAccepted: false, paymentAttempted: false };
  }
  async admit(context, raw, rawKey, budget = new Budget()) {
    const request = validateRequest(raw);
    const key = operationKey(rawKey);
    budget.tighten(request.limits);
    return await this.authenticated(context, budget, async c => {
      const grant = await this.db.authorize(c, context, false);
      if (grant.role === "reader") throw new JourneyError(403, "forbidden");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${ADMISSION}:${context.projectId}:${key}`]);
      const requestHash = hash({ grantId: grant.id, request });
      const existing = await receipt(c, ADMISSION, context.projectId, key);
      if (existing) {
        if (existing.request_hash !== requestHash) throw new JourneyError(409, "idempotency_conflict", "Restore the original body and grant for this key. A changed later input requires a new operation key.");
        return { ...existing.response_json, replayed: true };
      }
      await this.db.authorize(c, context, true);
      const count = (await c.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2", [REQUEST, context.projectId])).rows[0].n;
      if (count >= 128) throw new JourneyError(429, "project_job_capacity");
      const gapDigest = hash({ grantId: grant.id, key, request });
      const gap = { schema: "neomorphic.foundry.work-cell-gap.v1", id: `gap:useful:${hash({ grantId: grant.id, key }).slice(7)}`,
        contentId: gapDigest, resolverSnapshot: { uri: "https://samedaydesk.invalid/useful/supplied-request", digest: gapDigest },
        reproducer: { uri: "https://samedaydesk.invalid/useful/caller-snapshots", digest: hash(request.input) },
        permission: "synthetic", fundingKind: "unfunded-request" };
      const workScope = `sds:useful:${request.taskId}`;
      const id = cellIdFor(context.projectId, gap.id, workScope);
      await this.cells.mutate(context, null, { schema: COMMAND, action: "create", expectedRevision: 0, gap, workScope }, `admit:${hash([grant.id, key]).slice(7)}`, c);
      // Resolve a retained baseline from current tenant/task authority. It is
      // never a caller-provided success label or evidence from another recipe.
      let executionRequest = structuredClone(request);
      if (request.input.priorResult) {
        const ref = request.input.priorResult;
        const previous = await this.bound(c, context, ref.jobId, ref.taskId);
        if (previous.cell.status === "cancelled" || !previous.stored?.result.nextPrior) throw new JourneyError(409, "prior_result_unavailable");
        if (previous.stored.digest !== ref.digest || previous.stored.result.recipeId !== request.recipeId) throw new JourneyError(409, "prior_result_mismatch");
        executionRequest.input.prior = previous.stored.result.nextPrior;
        delete executionRequest.input.priorResult;
      }
      const admission = { schema: "samedaydesk.hosted-useful-admission.v1", jobId: id, taskId: request.taskId, admitted: true,
        status: `${PREFIX}/projects/${encodeURIComponent(context.projectId)}/jobs/${id}?taskId=${encodeURIComponent(request.taskId)}`,
        result: `${PREFIX}/projects/${encodeURIComponent(context.projectId)}/jobs/${id}/result?taskId=${encodeURIComponent(request.taskId)}`,
        deadlineAt: new Date(budget.deadlineAt).toISOString(), replayed: false, paymentAttempted: false, earnedWorkAccepted: false };
      // A recovered command must retain the cost of the final receipt writes,
      // authorization recheck and admission output even if its reply was lost.
      // Reserve a conservative bound for these fixed-shape remaining operations.
      const budgetLimits = { totalBytes: budget.totalBytes, outputBytes: budget.outputBytes };
      const admissionBytes = budget.used + Buffer.byteLength(JSON.stringify(executionRequest))
        + 2 * Buffer.byteLength(JSON.stringify(admission)) + 4096;
      if (admissionBytes > budget.totalBytes) throw new JourneyError(413, "allowance_exceeded");
      await append(c, REQUEST, context.projectId, id, requestHash, { grantId: grant.id, request: executionRequest,
        requestDigest: hash(request), deadlineAt: budget.deadlineAt, admissionBytes, budgetLimits });
      await append(c, ADMISSION, context.projectId, key, requestHash, admission);
      return admission;
    });
  }
  async status(context, id, task, budget = new Budget()) {
    return await this.authenticated(context, budget, async c => this.view(id, await this.bound(c, context, id, task)));
  }
  async result(context, id, task, budget = new Budget()) {
    return await this.authenticated(context, budget, async c => {
      const bound = await this.bound(c, context, id, task);
      const status = this.view(id, bound);
      if (!["completed", "failed"].includes(status.state)) throw new JourneyError(status.state === "cancelled" ? 410 : 409, `result_${status.state}`, status.nextAction);
      if (bound.cell.checkpoint?.artifact.digest !== bound.stored.digest) throw new JourneyError(409, "retained_binding_mismatch");
      return { ...status, ...bound.stored };
    });
  }
  async run(context, id, task, budget = new Budget()) {
    const claimed = await this.authenticated(context, budget, async c => {
      const bound = await this.bound(c, context, id, task, true);
      const status = this.view(id, bound);
      if (["completed", "failed", "running"].includes(status.state)) return { status };
      if (status.state === "cancelled" || status.state === "expired") throw new JourneyError(410, `job_${status.state}`, status.nextAction);
      if (status.state === "outcome_unknown") throw new JourneyError(409, "execution_outcome_unknown", "The original execution reserved this job's allowance. Retrieve any committed result; review an interrupted operation before creating a new intent.");
      budget.tighten(bound.record.request.limits, bound.record.deadlineAt);
      budget.tighten(bound.record.budgetLimits || {});
      budget.inherit(bound.record.admissionBytes, "prior-admission");
      const claimedCell = await this.cells.mutate(context, id, { schema: COMMAND, action: "claim", expectedRevision: bound.cell.revision,
        ttlSeconds: Math.max(1, Math.ceil(budget.remaining() / 1000)), voluntaryOptIn: true }, `run:${randomUUID()}`, c);
      // Physical child work may have consumed the whole allowance before a
      // process/reply loss. Reserve it durably in the existing receipt table;
      // recovery can read a committed result but cannot start a second child.
      await append(c, EXECUTION, context.projectId, id, hash({ fence: claimedCell.receipt.cell.fence }), {
        fence: claimedCell.receipt.cell.fence, deadlineAt: budget.deadlineAt, totalBytes: budget.totalBytes,
      });
      return { request: bound.record.request, cell: claimedCell.receipt.cell };
    });
    if (claimed.status) return claimed.status;
    const executionId = `${context.projectId}:${id}`;
    const controller = new AbortController();
    this.executions.set(executionId, controller);
    let retained;
    try { retained = await executeRecipe(claimed.request, budget, { reserveMs: 4500, signal: controller.signal }); }
    catch (error) { retained = failedExecution(claimed.request, error, budget); }
    finally { if (this.executions.get(executionId) === controller) this.executions.delete(executionId); }
    // The actual VF02 checkpoint verifies current revision, grant and fence.
    // Cancel, expiry, revocation or takeover makes this whole transaction fail.
    return await this.authenticated(context, budget, async c => {
      const bound = await this.bound(c, context, id, task, true);
      if (bound.stored) return this.view(id, bound);
      const checkpoint = await this.cells.mutate(context, id, { schema: COMMAND, action: "checkpoint", expectedRevision: claimed.cell.revision,
        fence: claimed.cell.fence, checkpoint: { schema: "neomorphic.foundry.checkpoint.v1",
          artifact: { uri: `https://samedaydesk.invalid/useful/results/${id}`, digest: retained.digest },
          summary: "Bounded recipe output retained; execution is separate from usefulness, acceptance and payment.",
          nextStep: "Retrieve through the authenticated job result route; opt in separately to export." } }, `finish:${id}:${claimed.cell.fence}`, c);
      await append(c, RESULT, context.projectId, id, hash({ taskId: task, inputDigest: retained.result.inputDigest, fence: claimed.cell.fence }), retained);
      await this.cells.mutate(context, id, { schema: COMMAND, action: "release", expectedRevision: checkpoint.receipt.revision,
        fence: claimed.cell.fence }, `release:${id}:${claimed.cell.fence}`, c);
      return this.view(id, await this.bound(c, context, id, task));
    });
  }
  async cancel(context, id, body, rawKey, budget = new Budget()) {
    const key = operationKey(rawKey);
    if (!body || Object.keys(body).some(k => !["taskId", "expectedRevision", "fence", "reason"].includes(k))
      || !Number.isInteger(body.expectedRevision) || typeof body.reason !== "string" || body.reason.length > 1000) throw new JourneyError(400, "invalid_cancel");
    const cancelled = await this.authenticated(context, budget, async c => {
      const bound = await this.bound(c, context, id, body.taskId, true);
      const requestHash = hash({ body, grantId: bound.grant.id });
      const scope = `${CANCEL}:${id}`;
      const old = await receipt(c, scope, context.projectId, key);
      if (old) {
        if (old.request_hash !== requestHash) throw new JourneyError(409, "idempotency_conflict");
        return { ...old.response_json, replayed: true };
      }
      if (bound.stored) throw new JourneyError(409, "job_already_completed");
      let current = bound.cell;
      if (current.revision !== body.expectedRevision) throw new JourneyError(409, "revision_conflict");
      if (bound.grant.role !== "owner" && current.status === "open") {
        const claim = await this.cells.mutate(context, id, { schema: COMMAND, action: "claim", expectedRevision: current.revision,
          voluntaryOptIn: true, ttlSeconds: 10 }, `cancel-claim:${hash([id, key]).slice(7)}`, c);
        current = claim.receipt.cell;
      }
      await this.cells.mutate(context, id, { schema: COMMAND, action: "cancel", expectedRevision: current.revision,
        ...(bound.grant.role !== "owner" ? { fence: current === bound.cell ? body.fence : current.fence } : {}), reason: body.reason }, `cancel:${hash([id, key]).slice(7)}`, c);
      const response = this.view(id, await this.bound(c, context, id, body.taskId));
      await append(c, scope, context.projectId, key, requestHash, response);
      return response;
    });
    if (cancelled.state === "cancelled") this.executions.get(`${context.projectId}:${id}`)?.abort();
    return cancelled;
  }
  async export(context, id, body, budget = new Budget()) {
    if (!body || body.optIn !== true || body.purpose !== "later-task-reuse" || typeof body.resultDigest !== "string"
      || Object.keys(body).some(k => !["taskId", "optIn", "purpose", "resultDigest", "subject", "sequence", "clock", "select"].includes(k))) throw new JourneyError(400, "export_opt_in_required");
    return await this.authenticated(context, budget, async c => {
      const bound = await this.bound(c, context, id, body.taskId, true);
      if (bound.cell.status === "cancelled" || !bound.stored) throw new JourneyError(409, "result_unavailable");
      if (bound.stored.digest !== body.resultDigest || bound.cell.checkpoint?.artifact.digest !== body.resultDigest) throw new JourneyError(409, "result_digest_mismatch");
      const recipe = bound.stored.result.recipe;
      const projected = exportReuse({ status: recipe.ok ? "success" : "invalid", ok: recipe.ok === true, networkUsed: false,
        records: [{ status: recipe.ok ? "success" : "invalid", fields: { taskId: body.taskId, recipeId: bound.record.request.recipeId,
          outcome: recipe.outcome, evidence: recipe.evidence, directUse: recipe.directUse ?? null } }], invalidRecords: [] }, {
        optIn: true, taskId: body.taskId, subject: body.subject, sequence: body.sequence, clock: body.clock,
        select: body.select || [], ownerScope: "samedaydesk.hosted-useful" });
      if (!projected.ok) throw new JourneyError(422, "export_projection_refused", projected.message);
      return { ...projected, retainedResultDigest: body.resultDigest,
        authorization: { projectId: context.projectId, grantId: bound.grant.id, purpose: body.purpose, current: true },
        delivery: "customer-held export only", publicWrite: false, acceptedContribution: false, paymentAttempted: false };
    });
  }
}

export async function openJourneyFromEnv(env = process.env) {
  if (!env.HOSTED_USEFUL_JOURNEY_OPT_IN) return { service: null, reason: "unconfigured" };
  if (env.HOSTED_USEFUL_JOURNEY_OPT_IN !== "1") return { service: null, reason: "invalid_config" };
  const config = inspectCorrespondenceEnv(env);
  if (config.kind !== "configured" || config.store !== "postgres" || !config.foundryOptIn) return { service: null, reason: "enrolled_postgres_required" };
  const service = new UsefulJourneyService(config.url, { schema: config.schema, poolMax: 2 });
  try { await service.checkReady(); return { service, reason: null }; }
  catch { await service.close(); return { service: null, reason: "store_unavailable" }; }
}
