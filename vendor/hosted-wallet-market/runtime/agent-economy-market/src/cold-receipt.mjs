import { digest, requireThat } from '../../agent-economy-foundation/dist/index.js';

export const COLD_SCOPE = 'hosted-machine-cold-v1';
export const coldKey = (actor, operationId) => digest({...actor, operationId});
export const coldRequest = (origin, actor, action, input, operationId) =>
  ({origin, ...actor, action, operationId, bodyDigest:digest(input)});
export const transitionId = (actor, action, operationId) => digest({actor:actor.actorId, action, operationId});

export function coldReceipt(request, result, evidence='atomic_operation') {
  const binding = {schema:'pilot.machine-market.cold-mutation-receipt.v1', ...request,
    taskId:result.taskId, resultDigest:digest(result), evidence, originalBodyRecorded:evidence==='atomic_operation'};
  return {...result, receipt:{...binding, receiptId:digest(binding)}};
}

export function checkedColdResult(request, result) {
  const {receipt, ...effect} = result ?? {};
  requireThat(receipt && Object.entries(request).every(([k,v])=>receipt[k]===v) &&
    receipt.taskId===effect.taskId && receipt.resultDigest===digest(effect) &&
    receipt.receiptId===digest((({receiptId,...binding})=>binding)(receipt)), 'receipt_binding');
  return result;
}
