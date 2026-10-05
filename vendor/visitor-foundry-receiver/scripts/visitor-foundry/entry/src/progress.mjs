import { hashRequest } from './deps.mjs';
export const RECEIVE_MS = 20000, ACK_MS = 3000;
// Disconnect stops local SQL immediately; the server's existing statement
// timeout bounds its current statement before session termination/rollback.
export const SQL_CLEANUP_MS = 5000;
export const PROGRESS_SCOPE = 'vf12:entry-progress:v1';
const states = ['unknown','pending','ready','declined'];
const codes = new Set(['transaction_aborted','receive_deadline','port_error','entry_binding_mismatch','charged_attempt_mismatch',
  'admission_binding_mismatch','host_installation_mismatch','receiver_pool_mismatch','installed_verification_changed',
  'immutable_pool_configuration','installed_source_changed','ingress_capacity','entry_busy','receiver_invalid_readback']);
export function phaseCode(error) {
  const sql = {'57014':'sql_statement_timeout','55P03':'sql_lock_timeout','40P01':'sql_deadlock','53300':'sql_capacity'};
  return sql[error?.code] ?? (codes.has(error?.code) ? error.code : /^08[A-Z0-9]{3}$/.test(error?.code ?? '') ? 'sql_connection_failure' : 'port_error');
}
export function progressBinding(row) {
  return hashRequest({registrationId:row.id,projectId:row.project_id,receiverId:row.receiver_id,requestHash:row.request_hash,
    entryTerms:row.entry_profile?.termsHash,hostConfigId:row.entry_profile?.contribution?.binding?.hostConfigId});
}
// Only this projection leaves the private journal. No error prose, SQL or args.
export function progressView(value) {
  if (!value || value.schema !== 'neomorphic.foundry.entry-progress.v1' || !Array.isArray(value.phases) || value.phases.length > 4) return null;
  const safeCodes = new Set([...codes,'sql_statement_timeout','sql_lock_timeout','sql_deadlock','sql_capacity','sql_connection_failure']);
  return {schema:value.schema,receiveBudgetMs:RECEIVE_MS,ackBudgetMs:ACK_MS,sqlCleanupBoundMs:SQL_CLEANUP_MS,totalBudgetMs:RECEIVE_MS+ACK_MS+SQL_CLEANUP_MS,
    plannedPhase:['begin','recover','read'].includes(value.plannedPhase)?value.plannedPhase:null,
    budgetExpired:value.budgetExpired===true,observedState:states.includes(value.observedState)?value.observedState:'unknown',
    acknowledgedState:states.includes(value.acknowledgedState)?value.acknowledgedState:'unknown',
    phases:value.phases.map(p=>({phase:['marker','begin','recover','read'].includes(p.phase)?p.phase:'unknown',
      outcome:['returned','error','deadline'].includes(p.outcome)?p.outcome:'error',
      code:p.code===null?null:safeCodes.has(p.code)?p.code:'port_error',
      state:states.includes(p.state)?p.state:null,ms:Number.isFinite(p.ms)?Math.max(0,Math.min(RECEIVE_MS,Math.round(p.ms))):null}))};
}
