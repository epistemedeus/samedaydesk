import { decidePermission } from "./contract.mjs";
import { consumeTemplateResult, projectTemplate, sealedDigest } from "./consume.mjs";
import { LATER_CONSUMER, PENDING_JOINS } from "./pending.mjs";

export const SCHEMA = "samedaydesk.ae20-e11-maintenance-shell.v1";

const MESSAGES = {
  maintained: "one finite maintenance occurrence was read under the current safe-derivative grant",
  unauthenticated: "the caller has no authenticated principal",
  forbidden: "the caller is not a distinct consumer for this occurrence",
  cross_tenant: "the authenticated tenant is not the maintenance tenant",
  task_mismatch: "the later task is not the admitted task for this occurrence",
  missing_permission: "a current permission was not supplied",
  revoked: "withdrawn consent refuses the next read",
  sharing_denied: "the permission does not admit this read",
  wrong_rights: "the safe-derivative grant does not cover this ask",
  unavailable: "the permission answer cannot be used",
  not_accepted: "the permission answer cannot be used",
  not_template_result: "the input is not the finite maintenance template result",
  result_digest_mismatch: "the template result digest does not match",
  not_finite: "the template result is not a finite occurrence",
  ambiguous_conflict: "readback does not match the original occurrence; no second post",
};

export function runMaintenanceShell(input = {}) {
  const fresh = evaluate(input);
  const prior = input.priorShell;
  if (prior && typeof prior === "object" && prior.occurrenceId && prior.occurrenceId === fresh.occurrenceId) {
    if (prior.digest === fresh.digest) {
      return {
        ...fresh,
        readback: true,
        executed: false,
        secondPost: false,
        posts: fresh.posts,
      };
    }
    return seal(base({
      ok: false,
      useful: true,
      usefulness: "useful_negative",
      code: "ambiguous_conflict",
      message: MESSAGES.ambiguous_conflict,
      occurrenceId: fresh.occurrenceId,
      taskId: fresh.taskId,
      executed: false,
      readback: false,
      secondPost: false,
      posts: 1,
      used: false,
      permissionChecks: fresh.permissionChecks,
    }));
  }
  return fresh;
}

function evaluate(input) {
  const consumed = consumeTemplateResult(input.result);
  if (!consumed.ok) {
    return seal(base({
      ok: false,
      useful: true,
      usefulness: "useful_negative",
      code: consumed.code,
      message: MESSAGES[consumed.code],
      executed: false,
      posts: 0,
      used: false,
    }));
  }
  const projected = projectTemplate(consumed.result);
  const permission = decidePermission({
    principal: input.principal,
    work: input.work,
    readCurrent: input.readCurrent,
    now: input.now,
    laterTaskId: input.laterTaskId,
    asked: input.asked,
    sourceTaskId: projected.taskId,
  });
  const admitted = permission.ok === true;
  const expired = permission.expired === true;
  const code = admitted ? "maintained" : permission.code;
  return seal(base({
    ok: admitted,
    useful: admitted ? projected.useful : true,
    usefulness: admitted ? projected.usefulness : "useful_negative",
    used: admitted,
    executed: admitted,
    readback: false,
    secondPost: false,
    posts: admitted ? 1 : 0,
    code,
    message: expired && code === "sharing_denied" ? "the permission is expired" : MESSAGES[code],
    occurrenceId: projected.occurrenceId,
    taskId: projected.taskId,
    distinctTaskId: projected.distinctTaskId,
    laterTaskId: typeof input.laterTaskId === "string" ? input.laterTaskId : null,
    tenantId: typeof input.principal?.tenantId === "string" ? input.principal.tenantId : null,
    consumedSchema: projected.consumedSchema,
    consumedDigest: projected.consumedDigest,
    disposition: admitted ? projected.disposition : null,
    acceptance: admitted ? projected.acceptance : null,
    retainedSkuReused: admitted ? projected.retainedSkuReused : false,
    detected: admitted ? projected.detected : null,
    change: admitted ? projected.change : [],
    asked: typeof input.asked === "string" && input.asked.length <= 64 ? input.asked : null,
    withdrawn: permission.withdrawn === true,
    expired,
    permissionChecks: permission.checks,
  }));
}

function base(partial) {
  return {
    schema: SCHEMA,
    ok: false,
    useful: false,
    usefulness: "useful_negative",
    used: false,
    executed: false,
    readback: false,
    secondPost: false,
    posts: 0,
    code: null,
    message: null,
    occurrenceId: null,
    taskId: null,
    distinctTaskId: null,
    laterTaskId: null,
    tenantId: null,
    consumedSchema: null,
    consumedDigest: null,
    disposition: null,
    acceptance: null,
    retainedSkuReused: false,
    detected: null,
    change: [],
    rights: "safe_derivative_only",
    asked: null,
    rawServed: false,
    withdrawn: false,
    expired: false,
    permissionChecks: [],
    supplierRerun: false,
    timerStarted: false,
    wroteQueue: false,
    wrotePrior: false,
    authorityStore: false,
    ledger: false,
    iouStore: false,
    published: false,
    paid: false,
    captured: false,
    settled: false,
    publicEnabled: false,
    finite: true,
    hJoin: "pending-join",
    laterConsumer: LATER_CONSUMER,
    pendingJoins: PENDING_JOINS.map((row) => ({ ...row })),
    ...partial,
  };
}

function seal(body) {
  body.digest = sealedDigest(body);
  return body;
}
